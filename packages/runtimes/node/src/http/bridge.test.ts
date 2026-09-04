import { randomBytes } from "node:crypto";
import { Agent, createServer, request as httpRequest } from "node:http";
import { connect } from "node:net";
import type { Server } from "node:http";
import type { Socket } from "node:net";
import { afterEach, describe, expect, test } from "vitest";

import type { BridgeOptions, RequestHandler } from "./bridge.js";
import { BridgeError } from "../errors.js";
import { createRequestListener } from "./bridge.js";

interface Served {
  readonly origin: string;
  readonly port: number;
  readonly server: Server;
}

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

async function serve(
  handle: RequestHandler,
  options: BridgeOptions = {},
): Promise<Served> {
  const server = createServer(createRequestListener(handle, options));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("server did not bind a TCP port");
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    port: address.port,
    server,
  };
}

describe("request bridge", () => {
  test("a GET reaches the handler as a Request and its Response comes back whole", async () => {
    const seen: string[] = [];
    const { origin } = await serve((request) => {
      seen.push(
        request.method,
        request.url,
        request.headers.get("x-probe") ?? "",
      );
      return Promise.resolve(
        new Response("hello", {
          status: 201,
          headers: { "content-type": "text/plain", "x-answer": "42" },
        }),
      );
    });

    const response = await fetch(`${origin}/path?q=1`, {
      headers: { "x-probe": "yes" },
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("x-answer")).toBe("42");
    expect(await response.text()).toBe("hello");
    expect(seen).toEqual(["GET", `${origin}/path?q=1`, "yes"]);
  });

  test("a streamed request body round-trips through the handler", async () => {
    const { origin } = await serve(async (request) => {
      const received = await request.text();
      return new Response(received.toUpperCase());
    });

    const chunks = ["hel", "lo ", "world"];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks)
          controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    });
    const response = await fetch(`${origin}/echo`, {
      method: "POST",
      body,
      // @ts-expect-error -- fetch streams a body only in half-duplex mode
      duplex: "half",
    });

    expect(await response.text()).toBe("HELLO WORLD");
  });

  test("a large binary body round-trips byte for byte", async () => {
    const { origin } = await serve(async (request) => {
      return new Response(await request.arrayBuffer(), {
        headers: { "content-type": "application/octet-stream" },
      });
    });
    const payload = randomBytes(5 * 1024 * 1024);

    const response = await fetch(`${origin}/blob`, {
      method: "PUT",
      body: payload,
    });

    expect(Buffer.from(await response.arrayBuffer()).equals(payload)).toBe(
      true,
    );
  });

  test("HEAD carries the headers and no body", async () => {
    const { origin } = await serve(() =>
      Promise.resolve(
        new Response("never sent", { headers: { "x-answer": "42" } }),
      ),
    );

    const response = await fetch(`${origin}/`, { method: "HEAD" });

    expect(response.headers.get("x-answer")).toBe("42");
    expect(await response.text()).toBe("");
  });

  test("a 204 sends no body", async () => {
    const { origin } = await serve(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    );

    const response = await fetch(`${origin}/`);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  test("multiple Set-Cookie headers arrive separately, however the Response was built", async () => {
    const appended = new Headers();
    appended.append("set-cookie", "a=1; Path=/");
    appended.append("set-cookie", "b=2; Path=/; HttpOnly");
    const { origin } = await serve((request) =>
      Promise.resolve(
        new URL(request.url).pathname === "/appended"
          ? new Response("", { headers: appended })
          : new Response("", {
              headers: [
                ["set-cookie", "a=1; Path=/"],
                ["set-cookie", "b=2; Path=/; HttpOnly"],
              ],
            }),
      ),
    );

    for (const path of ["/appended", "/raw"]) {
      const response = await fetch(`${origin}${path}`);
      expect(response.headers.getSetCookie(), path).toEqual([
        "a=1; Path=/",
        "b=2; Path=/; HttpOnly",
      ]);
    }
  });

  test("a non-ASCII path resolves", async () => {
    const { origin } = await serve((request) =>
      Promise.resolve(
        new Response(decodeURIComponent(new URL(request.url).pathname)),
      ),
    );

    const response = await fetch(`${origin}/${encodeURIComponent("café")}`);

    expect(await response.text()).toBe("/café");
  });

  test("a path decodeURI rejects answers 400 without reaching the handler", async () => {
    let reached = false;
    const { origin } = await serve(() => {
      reached = true;
      return Promise.resolve(new Response("ok"));
    });

    const response = await fetch(`${origin}/%E0%A4%A`);

    expect(response.status).toBe(400);
    expect(reached).toBe(false);
  });

  test("a body over the limit fails when consumed, not before", async () => {
    let failure: unknown;
    const { origin } = await serve(
      async (request) => {
        try {
          await request.text();
          return new Response("read it all");
        } catch (error) {
          failure = error;
          return new Response("too large", { status: 413 });
        }
      },
      { bodySizeLimit: 1024 },
    );

    const response = await fetch(`${origin}/upload`, {
      method: "POST",
      body: "x".repeat(4096),
    });

    expect(response.status).toBe(413);
    expect(failure).toBeInstanceOf(BridgeError);
    expect(failure).toMatchObject({ code: "body_too_large", limit: 1024 });
  });

  test("a client abort mid-stream cancels the response body's reader", async () => {
    let cancelled: (reason: unknown) => void = () => undefined;
    const cancellation = new Promise<unknown>((resolve) => {
      cancelled = resolve;
    });
    let signal: AbortSignal | undefined;
    const { port } = await serve((request) => {
      signal = request.signal;
      return Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("first chunk"));
              // Never closes: the only way out is the client going away.
            },
            cancel(reason) {
              cancelled(reason);
            },
          }),
        ),
      );
    });

    await new Promise<void>((resolve, reject) => {
      const client = httpRequest(
        { host: "127.0.0.1", port, path: "/stream" },
        (response) => {
          response.once("data", () => {
            client.destroy();
            resolve();
          });
        },
      );
      client.on("error", reject);
      client.end();
    });

    await expect(
      Promise.race([
        cancellation.then(() => "cancelled"),
        new Promise((resolve) => setTimeout(() => resolve("timed out"), 2000)),
      ]),
    ).resolves.toBe("cancelled");
    expect(signal?.aborted).toBe(true);
  });

  test("listener counts on one keep-alive connection stay flat across many requests", async () => {
    const sockets: Socket[] = [];
    const { port, server } = await serve(() =>
      Promise.resolve(new Response("ok")),
    );
    server.on("connection", (socket) => sockets.push(socket));
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    const get = () =>
      new Promise<void>((resolve, reject) => {
        const client = httpRequest(
          { host: "127.0.0.1", port, path: "/", agent },
          (response) => {
            response.resume();
            response.on("end", resolve);
          },
        );
        client.on("error", reject);
        client.end();
      });
    const listeners = () =>
      new Promise<number>((resolve) =>
        setImmediate(() => resolve(sockets[0]?.listenerCount("close") ?? -1)),
      );

    await get();
    const afterFirst = await listeners();
    for (let i = 0; i < 40; i++) await get();
    const afterMany = await listeners();
    agent.destroy();

    expect(sockets).toHaveLength(1);
    expect(afterMany).toBe(afterFirst);
  });

  test("a handler that throws answers 500 instead of hanging the request", async () => {
    const { origin } = await serve(() => Promise.reject(new Error("boom")));

    const response = await fetch(`${origin}/`);

    expect(response.status).toBe(500);
  });

  test("forwarding headers are ignored unless the proxy is trusted", async () => {
    const seen: { url: string; clientAddress?: string }[] = [];
    const handle: RequestHandler = (request, meta) => {
      seen.push({ url: request.url, clientAddress: meta.clientAddress });
      return Promise.resolve(new Response(""));
    };
    const forged = {
      "x-forwarded-proto": "https",
      "x-forwarded-host": "cms.example",
      "x-forwarded-for": "203.0.113.9, 198.51.100.2",
    };

    const direct = await serve(handle);
    await fetch(`${direct.origin}/p`, { headers: forged });
    const proxied = await serve(handle, { trustProxy: true });
    await fetch(`${proxied.origin}/p`, { headers: forged });

    expect(seen).toEqual([
      { url: `${direct.origin}/p`, clientAddress: "127.0.0.1" },
      { url: "https://cms.example/p", clientAddress: "198.51.100.2" },
    ]);
  });

  test("the URL carries the bound port when the request has no Host", async () => {
    let url = "";
    const { port } = await serve((request) => {
      url = request.url;
      return Promise.resolve(new Response(""));
    });

    await new Promise<void>((resolve, reject) => {
      const socket = connect(port, "127.0.0.1", () => {
        socket.write("GET /no-host HTTP/1.0\r\n\r\n");
      });
      socket.on("data", () => socket.end());
      socket.on("close", () => resolve());
      socket.on("error", reject);
    });

    expect(url).toBe(`http://localhost:${port}/no-host`);
  });

  test("a request Node parses but fetch rejects answers 400 and leaves the server up", async () => {
    const { port, origin } = await serve(() =>
      Promise.resolve(new Response("ok")),
    );
    const raw = (head: string) =>
      new Promise<string>((resolve, reject) => {
        let reply = "";
        const socket = connect(port, "127.0.0.1", () => socket.write(head));
        socket.on("data", (chunk: Buffer) => {
          reply += chunk.toString();
          socket.end();
        });
        socket.on("close", () => resolve(reply));
        socket.on("error", reject);
      });

    expect(await raw("TRACE / HTTP/1.1\r\nHost: x\r\n\r\n")).toMatch(
      /^HTTP\/1\.1 400/,
    );
    expect(await raw("GET / HTTP/1.1\r\nHost: a b\r\n\r\n")).toMatch(
      /^HTTP\/1\.1 400/,
    );
    expect((await fetch(`${origin}/`)).status).toBe(200);
  });

  test("a body the handler never reads does not wedge the keep-alive connection", async () => {
    const sockets: Socket[] = [];
    const { port, server } = await serve(() =>
      Promise.resolve(new Response("ignored the body", { status: 401 })),
    );
    server.on("connection", (socket) => sockets.push(socket));
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    const send = (method: string, body?: Buffer) =>
      new Promise<number>((resolve, reject) => {
        const client = httpRequest(
          { host: "127.0.0.1", port, path: "/", method, agent },
          (response) => {
            response.resume();
            response.on("end", () => resolve(response.statusCode ?? 0));
          },
        );
        client.on("error", reject);
        client.end(body);
      });

    expect(await send("POST", randomBytes(512 * 1024))).toBe(401);
    expect(await send("GET")).toBe(401);
    agent.destroy();
    expect(sockets).toHaveLength(1);
  });

  test("an empty trailing x-forwarded-for entry falls back to the socket address", async () => {
    let address: string | undefined;
    const { origin } = await serve(
      (_request, meta) => {
        address = meta.clientAddress;
        return Promise.resolve(new Response(""));
      },
      { trustProxy: true },
    );

    await fetch(`${origin}/`, {
      headers: { "x-forwarded-for": "203.0.113.9, " },
    });

    expect(address).toBe("127.0.0.1");
  });

  test("HEAD cancels the body the handler produced", async () => {
    let cancelled = false;
    const { origin } = await serve(() =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("x"));
            },
            cancel() {
              cancelled = true;
            },
          }),
        ),
      ),
    );

    await fetch(`${origin}/`, { method: "HEAD" });
    await new Promise((resolve) => setImmediate(resolve));

    expect(cancelled).toBe(true);
  });

  test("the malformed-path guard leaves the query string alone", async () => {
    const { origin } = await serve((request) =>
      Promise.resolve(new Response(new URL(request.url).search)),
    );

    const response = await fetch(`${origin}/ok?q=100%`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("?q=100%");
  });

  test("a protocol-relative request target cannot rewrite the origin", async () => {
    let url = "";
    const { port, origin } = await serve((request) => {
      url = request.url;
      return Promise.resolve(new Response(""));
    });

    await new Promise<void>((resolve, reject) => {
      const socket = connect(port, "127.0.0.1", () => {
        socket.write(
          `GET //evil.example/p HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`,
        );
      });
      socket.on("data", () => socket.end());
      socket.on("close", () => resolve());
      socket.on("error", reject);
    });

    expect(url).toBe(`${origin}//evil.example/p`);
  });
});

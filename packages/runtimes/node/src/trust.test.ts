import { mkdtempSync, rmSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  auth as authConfig,
  buildApp,
  definePlugin,
  defineTheme,
  fallback,
  plumix,
} from "plumix";
import * as schema from "plumix/schema";
import { sessions } from "plumix/schema";
import { applyTestSchema, factoriesFor } from "plumix/test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import type { NodeConfig } from "./adapter.js";
import { node } from "./adapter.js";
import { BridgeError } from "./errors.js";
import {
  createRequestListener,
  DEFAULT_BODY_SIZE_LIMIT,
} from "./http/bridge.js";
import { listen } from "./http/test-support.js";
import { nodeSqlite } from "./node-sqlite.js";

const SITE_ORIGIN = "https://cms.example";
const EMAIL = "editor@example.test";

// What a hostile client, or a trusted proxy, puts on a request.
const FORWARDED = {
  "x-forwarded-proto": "https",
  "x-forwarded-host": "cms.example",
  "x-forwarded-for": "203.0.113.9, 198.51.100.2",
};

const probe = definePlugin("probe", (ctx) => {
  ctx.registerPublicRoute({
    path: "/whoami",
    handler: (request, appCtx) =>
      Response.json({ url: request.url, address: appCtx.clientAddress }),
  });
  ctx.registerRoute({
    path: "/swallow",
    method: "POST",
    auth: "public",
    handler: async (request) => {
      try {
        return new Response(String((await request.text()).length));
      } catch (error) {
        return new Response(error instanceof BridgeError ? error.code : "?", {
          status: 413,
        });
      }
    },
  });
});

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "plumix-node-trust-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// The composition the generated entry makes: the bridge in front of the
// adapter's handler, the bridge's client address on the invocation.
async function serveSite(config: NodeConfig) {
  const database = nodeSqlite({ path: join(dir, "site.sqlite") });
  const db = database.connect({}, new Request(SITE_ORIGIN), schema).db;
  await applyTestSchema(db, schema);
  const factory = factoriesFor(db);
  const user = await factory.user.create({ email: EMAIL, role: "editor" });
  const { token } = await factory.authToken.create({
    userId: user.id,
    email: EMAIL,
  });
  const adapter = node(config);
  const app = await buildApp(
    plumix({
      runtime: adapter,
      database,
      auth: authConfig({
        passkey: {
          rpName: "Plumix Test",
          rpId: "cms.example",
          origin: SITE_ORIGIN,
        },
        magicLink: { siteName: "Plumix Test" },
      }),
      // Never sends — the token is seeded above — but magicLink insists on one.
      mailer: { send: () => Promise.resolve() },
      theme: defineTheme({ templates: [fallback(() => null)] }),
      plugins: [probe],
    }),
  );
  const handler = adapter.createHandler(app);
  const served = await listen(
    createRequestListener(
      async (request, meta) =>
        handler.fetch(request, { env: {}, clientAddress: meta.clientAddress }),
      config,
    ),
  );
  return { ...served, db, token };
}

// Core's own login, minus the mail: the session row and cookie the verify
// route produces are what the runtime's trust decisions land on.
async function sessionCookie(
  origin: string,
  token: string,
  headers: Record<string, string>,
): Promise<string> {
  const verified = await fetch(
    `${origin}/_plumix/auth/magic-link/verify?token=${token}`,
    { headers, redirect: "manual" },
  );
  expect(verified.status).toBe(302);
  const cookie = verified.headers
    .getSetCookie()
    .find((c) => c.startsWith("plumix_session="));
  if (!cookie) throw new Error("verify set no session cookie");
  return cookie;
}

async function whoami(origin: string): Promise<unknown> {
  return (await fetch(`${origin}/whoami`, { headers: FORWARDED })).json();
}

describe("trustProxy off", () => {
  test("forged forwarding headers are ignored: the socket address and an http URL are recorded", async () => {
    const { origin, db, token } = await serveSite({});

    expect(await whoami(origin)).toEqual({
      url: `${origin}/whoami`,
      address: "127.0.0.1",
    });
    expect(await sessionCookie(origin, token, FORWARDED)).not.toContain(
      "Secure",
    );
    const [session] = await db.select().from(sessions);
    expect(session?.ipAddress).toBe("127.0.0.1");
  });
});

describe("trustProxy on", () => {
  test("the forwarded scheme, host and rightmost address are recorded, and the cookie is Secure", async () => {
    const { origin, db, token } = await serveSite({ trustProxy: true });

    expect(await whoami(origin)).toEqual({
      url: `${SITE_ORIGIN}/whoami`,
      address: "198.51.100.2",
    });
    expect(await sessionCookie(origin, token, FORWARDED)).toContain("Secure");
    const [session] = await db.select().from(sessions);
    expect(session?.ipAddress).toBe("198.51.100.2");
  });
});

describe("the URL the bridge builds", () => {
  // An HTTP/1.0 request may omit Host; the bridge then names `localhost` and
  // the bound port, so that — not the socket's `127.0.0.1` — is the origin
  // core compares against.
  function rawRpc(port: number, origin: string): Promise<string> {
    const body = JSON.stringify({ json: {} });
    const head = [
      "POST /_plumix/rpc/auth/session HTTP/1.0",
      `Origin: ${origin}`,
      "X-Plumix-Request: 1",
      "Content-Type: application/json",
      `Content-Length: ${Buffer.byteLength(body)}`,
      "",
      body,
    ].join("\r\n");
    return new Promise((resolve, reject) => {
      let received = "";
      const socket = connect(port, "127.0.0.1", () => socket.write(head));
      socket.on("data", (chunk: Buffer) => (received += chunk.toString()));
      socket.on("close", () => resolve(received));
      socket.on("error", reject);
    });
  }

  test("carries the bound port when Host is absent, so a same-origin RPC passes the CSRF check", async () => {
    const { port } = await serveSite({});

    const same = await rawRpc(port, `http://localhost:${port}`);
    expect(same).toMatch(/^HTTP\/1\.1 200/);
    expect(same).toContain('"needsBootstrap":false');

    // The port is what decides it: one off, and the same request is forgery.
    const other = await rawRpc(port, `http://localhost:${port + 1}`);
    expect(other).toMatch(/^HTTP\/1\.1 403/);
    expect(other).toContain("csrf_origin_mismatch");
  });
});

describe("bodySizeLimit", () => {
  test("reaches the bridge: a body over it fails when the route consumes it", async () => {
    const { origin } = await serveSite({ bodySizeLimit: 1024 });
    const response = await fetch(`${origin}/_plumix/probe/swallow`, {
      method: "POST",
      headers: {
        origin,
        "content-type": "text/plain",
        "x-plumix-request": "1",
      },
      body: "x".repeat(4096),
    });
    expect(response.status).toBe(413);
    expect(await response.text()).toBe("body_too_large");
  });

  // A tripwire on the number, not a proof of the mechanism: the case above
  // proves the option reaches the bridge, and a 1 GiB body is no unit test.
  test("is pinned at 1 GiB", () => {
    expect(DEFAULT_BODY_SIZE_LIMIT).toBe(1024 * 1024 * 1024);
  });
});

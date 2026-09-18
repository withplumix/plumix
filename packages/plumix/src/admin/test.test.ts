import { ORPCError } from "@orpc/client";
import * as v from "valibot";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { base } from "@plumix/core";

import { createPluginRpcClient } from "./plugin-rpc.js";
import { PluginRpcError, stubPluginRpc } from "./test.js";

// The shape a plugin's server module hands `registerRpcRouter`. Only its type
// is under test: the handlers never run, the stub answers at the fetch
// boundary.
const _menuRouter = {
  list: base
    .input(v.object({ termId: v.number() }))
    .handler((): readonly { id: number; name: string }[] => []),
  delete: base
    .input(v.object({ id: v.number() }))
    .handler(({ input }): { id: number } => ({ id: input.id })),
  save: base.input(v.object({})).handler((): { version: number } => ({
    version: 1,
  })),
  locations: {
    list: base.handler((): readonly { id: string }[] => []),
  },
  sync: base
    .input(v.object({ since: v.date() }))
    .handler((): { at: Date } => ({ at: new Date() })),
  upload: base
    .input(v.object({ file: v.instance(File), name: v.string() }))
    .handler((): { size: number } => ({ size: 0 })),
  thumbnail: base
    .input(v.object({ id: v.number() }))
    .handler((): { body: Blob } => ({ body: new Blob([]) })),
  rows: base.input(v.object({ termId: v.number() })).handler(
    (): readonly {
      id: number;
      seenAt: Date;
      tags: ReadonlySet<string>;
    }[] => [],
  ),
};

type MenuRouter = typeof _menuRouter;

beforeEach(() => {
  vi.stubGlobal("location", new URL("https://cms.example/admin"));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("stubPluginRpc", () => {
  test("routes a call by procedure path and records it", async () => {
    const stub = stubPluginRpc("menu", {
      list: () => [{ id: 1, name: "Main" }],
    });
    const rpc = createPluginRpcClient<MenuRouter>("menu");

    const result = await rpc.list({ termId: 7 });

    expect(result).toEqual([{ id: 1, name: "Main" }]);
    expect(stub.lastCallTo("list")).toEqual({
      procedure: "list",
      input: { termId: 7 },
    });
  });

  test("a Date a responder returns resolves as a Date, not its JSON projection", async () => {
    const at = new Date("2026-05-10T10:00:00.000Z");
    stubPluginRpc("menu", { sync: () => ({ at }) });
    const rpc = createPluginRpcClient<MenuRouter>("menu");

    const result = await rpc.sync({ since: at });

    expect(result.at).toBeInstanceOf(Date);
    expect(result.at.getTime()).toBe(at.getTime());
  });

  test("a Date the client sends reaches the responder, and the record, as a Date", async () => {
    const since = new Date("2026-05-10T10:00:00.000Z");
    let seen: unknown;
    const stub = stubPluginRpc("menu", {
      sync: (input) => {
        seen = input;
        return { at: since };
      },
    });
    const rpc = createPluginRpcClient<MenuRouter>("menu");

    await rpc.sync({ since });

    expect(seen).toEqual({ since });
    expect((seen as { since: unknown }).since).toBeInstanceOf(Date);
    expect(stub.lastCallTo("sync")?.input).toEqual({ since });
  });

  test("a nested non-JSON value revives at its own path, not just at the root", async () => {
    const first = new Date("2026-05-10T10:00:00.000Z");
    const second = new Date("2026-05-11T09:30:00.000Z");
    stubPluginRpc("menu", {
      rows: () => [
        { id: 1, seenAt: first, tags: new Set(["nav"]) },
        { id: 2, seenAt: second, tags: new Set<string>() },
      ],
    });
    const rpc = createPluginRpcClient<MenuRouter>("menu");

    const rows = await rpc.rows({ termId: 7 });

    expect(rows[0]?.seenAt).toBeInstanceOf(Date);
    expect(rows[1]?.seenAt).toEqual(second);
    expect(rows[0]?.tags).toEqual(new Set(["nav"]));
  });

  test("an unrouted procedure answers 404 and still shows up in calls", async () => {
    const stub = stubPluginRpc("menu", {});
    const rpc = createPluginRpcClient<MenuRouter>("menu");

    await expect(rpc.delete({ id: 1 })).rejects.toThrow();
    expect(stub.calls).toEqual([{ procedure: "delete", input: { id: 1 } }]);
  });

  test("a fetch the stub doesn't serve throws, naming the URL and the prefix", async () => {
    stubPluginRpc("menu", {});

    await expect(
      fetch("https://cms.example/_plumix/rpc/pages/list"),
    ).rejects.toThrow(
      /https:\/\/cms\.example\/_plumix\/rpc\/pages\/list[\s\S]*\/_plumix\/rpc\/menu\b/,
    );
  });

  test("a File in the input reaches the responder as a real File", async () => {
    let seen: unknown;
    const stub = stubPluginRpc("menu", {
      upload: (input) => {
        seen = (input as { file: unknown }).file;
        return { size: (seen as Blob).size };
      },
    });
    const rpc = createPluginRpcClient<MenuRouter>("menu");

    // A payload carrying a blob is posted as multipart `FormData`, not JSON —
    // the branch that used to throw a bare SyntaxError inside the stub.
    const result = await rpc.upload({
      file: new File(["hello world"], "a.txt", { type: "text/plain" }),
      name: "a.txt",
    });

    expect(seen).toBeInstanceOf(Blob);
    expect(await (seen as Blob).text()).toBe("hello world");
    expect(result.size).toBe(11);
    expect(stub.lastCallTo("upload")?.input).toMatchObject({ name: "a.txt" });
  });

  test("a Blob a responder returns reaches the client as a Blob", async () => {
    stubPluginRpc("menu", {
      thumbnail: () => ({
        body: new Blob(["png-bytes"], { type: "image/png" }),
      }),
    });
    const rpc = createPluginRpcClient<MenuRouter>("menu");

    const result = await rpc.thumbnail({ id: 1 });

    expect(result.body).toBeInstanceOf(Blob);
    expect(await result.body.text()).toBe("png-bytes");
  });

  test("an unrouted procedure answers exactly what the dispatcher answers", async () => {
    stubPluginRpc("menu", {});

    const response = await fetch(
      "https://cms.example/_plumix/rpc/menu/delete",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { id: 1 } }),
      },
    );

    // Not an oRPC error envelope: oRPC reports the miss without producing a
    // response at all, and the dispatcher answers its own plain-text 404. A
    // client rejection from here is therefore a malformed-response one, which
    // is what a real deployment produces.
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(response.headers.get("x-plumix-hint")).toBe(
      "rpc-procedure-not-found",
    );
    expect(await response.text()).toBe("Not Found");
  });

  test("a subdirectory deploy's base path still routes", async () => {
    const stub = stubPluginRpc("menu", {
      list: () => [{ id: 1, name: "Main" }],
    });

    // `createPluginRpcClient` prepends `globalThis.plumix.basePath`, so the
    // procedures mount below it rather than at the root.
    const response = await fetch(
      "https://cms.example/site/_plumix/rpc/menu/list",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { termId: 7 } }),
      },
    );

    expect(response.status).toBe(200);
    expect(stub.lastCallTo("list")?.input).toEqual({ termId: 7 });
  });

  test("a non-POST request answers 405, as the dispatcher does", async () => {
    stubPluginRpc("menu", { list: () => [] });

    const response = await fetch("https://cms.example/_plumix/rpc/menu/list", {
      method: "GET",
    });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  test("a nested procedure path round-trips through the prefix", async () => {
    stubPluginRpc("menu", {
      "locations/list": () => [{ id: "primary" }],
    });
    const rpc = createPluginRpcClient<MenuRouter>("menu");

    expect(await rpc.locations.list()).toEqual([{ id: "primary" }]);
  });

  test("a route map mounting under a procedure is refused, either order", () => {
    const both = {
      list: () => [],
      "list/count": () => 0,
    };

    expect(() => stubPluginRpc("menu", both)).toThrow(/list\/count/);
    expect(() =>
      stubPluginRpc("menu", {
        "list/count": both["list/count"],
        list: both.list,
      }),
    ).toThrow(/list\/count/);
  });

  test("an ORPCError a responder throws reaches the client untouched", async () => {
    stubPluginRpc("menu", {
      save: () => {
        throw new ORPCError("PAYMENT_REQUIRED", {
          status: 402,
          data: { plan: "pro" },
        });
      },
    });
    const rpc = createPluginRpcClient<MenuRouter>("menu");

    const error: unknown = await rpc
      .save({})
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: "PAYMENT_REQUIRED",
      status: 402,
      data: { plan: "pro" },
    });
  });

  test("a thrown PluginRpcError surfaces its code, status and data on the client", async () => {
    stubPluginRpc("menu", {
      save: () => {
        throw new PluginRpcError("CONFLICT", {
          status: 409,
          data: { reason: "version_mismatch", key: "4" },
        });
      },
    });
    const rpc = createPluginRpcClient<MenuRouter>("menu");

    const error: unknown = await rpc
      .save({})
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: "CONFLICT",
      status: 409,
      data: { reason: "version_mismatch", key: "4" },
    });
  });

  test("a PluginRpcError's data revives too, with its code and status intact", async () => {
    const expiresAt = new Date("2026-05-10T10:00:00.000Z");
    stubPluginRpc("menu", {
      save: () => {
        throw new PluginRpcError("CONFLICT", {
          status: 409,
          data: { reason: "version_mismatch", expiresAt },
        });
      },
    });
    const rpc = createPluginRpcClient<MenuRouter>("menu");

    const error: unknown = await rpc
      .save({})
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "CONFLICT", status: 409 });
    const { data } = error as { data: { expiresAt: unknown } };
    expect(data.expiresAt).toBeInstanceOf(Date);
    expect(data.expiresAt).toEqual(expiresAt);
  });

  test("a plain throw answers 500 with the envelope a real handler sends", async () => {
    stubPluginRpc("menu", {
      save: () => {
        throw new Error("boom");
      },
    });
    const rpc = createPluginRpcClient<MenuRouter>("menu");

    const error: unknown = await rpc
      .save({})
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      status: 500,
    });
    // A real handler's error envelope carries no `data`. The client only
    // populates one when the body failed `isORPCErrorJson` and it fell back to
    // the malformed-response path, so an undefined `data` is what proves the
    // body was a genuine envelope.
    expect((error as { data?: unknown }).data).toBeUndefined();
  });
});

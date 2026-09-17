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
  rows: base.input(v.object({ termId: v.number() })).handler(
    (): readonly {
      id: number;
      seenAt: Date;
      tags: ReadonlySet<string>;
    }[] => [],
  ),
};

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
    const rpc = createPluginRpcClient<typeof _menuRouter>("menu");

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
    const rpc = createPluginRpcClient<typeof _menuRouter>("menu");

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
    const rpc = createPluginRpcClient<typeof _menuRouter>("menu");

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
    const rpc = createPluginRpcClient<typeof _menuRouter>("menu");

    const rows = await rpc.rows({ termId: 7 });

    expect(rows[0]?.seenAt).toBeInstanceOf(Date);
    expect(rows[1]?.seenAt).toEqual(second);
    expect(rows[0]?.tags).toEqual(new Set(["nav"]));
  });

  test("an unrouted procedure answers 404 and still shows up in calls", async () => {
    const stub = stubPluginRpc("menu", {});
    const rpc = createPluginRpcClient<typeof _menuRouter>("menu");

    await expect(rpc.delete({ id: 1 })).rejects.toThrow();
    expect(stub.calls).toEqual([{ procedure: "delete", input: { id: 1 } }]);
  });

  test("a nested procedure path round-trips through the prefix", async () => {
    stubPluginRpc("menu", {
      "locations/list": () => [{ id: "primary" }],
    });
    const rpc = createPluginRpcClient<typeof _menuRouter>("menu");

    expect(await rpc.locations.list()).toEqual([{ id: "primary" }]);
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
    const rpc = createPluginRpcClient<typeof _menuRouter>("menu");

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
    const rpc = createPluginRpcClient<typeof _menuRouter>("menu");

    const error = await rpc.save({}).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "CONFLICT", status: 409 });
    const { data } = error as { data: { expiresAt: unknown } };
    expect(data.expiresAt).toBeInstanceOf(Date);
    expect(data.expiresAt).toEqual(expiresAt);
  });

  test("a plain throw answers 500", async () => {
    stubPluginRpc("menu", {
      save: () => {
        throw new Error("boom");
      },
    });
    const rpc = createPluginRpcClient<typeof _menuRouter>("menu");

    const error: unknown = await rpc
      .save({})
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ status: 500 });
  });
});

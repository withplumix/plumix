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

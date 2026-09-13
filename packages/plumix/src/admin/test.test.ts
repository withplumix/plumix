import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createPluginRpcClient } from "./plugin-rpc.js";
import { PluginRpcError, stubPluginRpc } from "./test.js";

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
    const rpc = createPluginRpcClient("menu");

    const result = await rpc.call("list", { termId: 7 });

    expect(result).toEqual([{ id: 1, name: "Main" }]);
    expect(stub.lastCallTo("list")).toEqual({
      procedure: "list",
      input: { termId: 7 },
    });
  });

  test("an unrouted procedure answers 404 and still shows up in calls", async () => {
    const stub = stubPluginRpc("menu", {});
    const rpc = createPluginRpcClient("menu");

    await expect(rpc.call("delete", { id: 1 })).rejects.toThrow();
    expect(stub.calls).toEqual([{ procedure: "delete", input: { id: 1 } }]);
  });

  test("a nested procedure path round-trips through the prefix", async () => {
    stubPluginRpc("menu", {
      "locations/list": () => [{ id: "primary" }],
    });
    const rpc = createPluginRpcClient("menu");

    expect(await rpc.call("locations/list")).toEqual([{ id: "primary" }]);
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
    const rpc = createPluginRpcClient("menu");

    const error: unknown = await rpc
      .call("save", {})
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
    const rpc = createPluginRpcClient("menu");

    const error: unknown = await rpc
      .call("save", {})
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ status: 500 });
  });
});

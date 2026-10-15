import { stubPluginRpc } from "plumix/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { mediaLabelsQuery } from "./rpc.js";

// Node has no `location`; the client builds its URL from one.
beforeEach(() => {
  vi.stubGlobal("location", new URL("https://cms.example/admin"));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mediaLabelsQuery", () => {
  test("resolves labels through the core lookup procedure", async () => {
    const stub = stubPluginRpc("lookup", {
      list: () => ({ items: [{ id: "1", label: "cat.png" }] }),
    });

    const result = await mediaLabelsQuery(["1"]).queryFn();

    expect(result).toEqual({ items: [{ id: "1", label: "cat.png" }] });
    expect(stub.lastCallTo("list")?.input).toEqual({
      kind: "media",
      ids: ["1"],
    });
  });
});

import { describe, expect, test } from "vitest";

import type { ResolvedBlockLoaders } from "./loaders.js";
import { parseLoaderData, serializeLoaderData } from "./loader-data.js";

describe("loader-data round trip", () => {
  test("serializes resolved loaders to a node-keyed JSON map", () => {
    const resolved: ResolvedBlockLoaders = new Map([
      ["a", { loaders: { posts: [{ id: 1 }] }, error: null }],
      ["b", { loaders: { count: 3 }, error: null }],
    ]);

    expect(JSON.parse(serializeLoaderData(resolved))).toEqual({
      a: { posts: [{ id: 1 }] },
      b: { count: 3 },
    });
  });

  test("omits blocks whose loader errored (no data to seed)", () => {
    const resolved: ResolvedBlockLoaders = new Map([
      ["ok", { loaders: { x: 1 }, error: null }],
      ["bad", { loaders: {}, error: new Error("boom") }],
    ]);

    expect(JSON.parse(serializeLoaderData(resolved))).toEqual({ ok: { x: 1 } });
  });

  test("parses the embedded map back into resolved loader data", () => {
    const map = parseLoaderData('{"a":{"posts":[{"id":1}]}}');
    expect(map.get("a")).toEqual({
      loaders: { posts: [{ id: 1 }] },
      error: null,
    });
  });

  test("returns an empty map for malformed or empty input", () => {
    expect(parseLoaderData("").size).toBe(0);
    expect(parseLoaderData("not json").size).toBe(0);
    expect(parseLoaderData("[1,2,3]").size).toBe(0);
  });
});

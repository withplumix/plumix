import { describe, expect, test } from "vitest";

import type { ResolvedBlockLoaders } from "@plumix/blocks";

import { mergeLoaderData } from "./merge-loader-data.js";

describe("mergeLoaderData", () => {
  test("overlays a refreshed node onto the prior map", () => {
    const prior: ResolvedBlockLoaders = new Map([
      ["a", { loaders: { posts: ["old"] }, error: null }],
      ["b", { loaders: { tags: ["x"] }, error: null }],
    ]);

    const next = mergeLoaderData(prior, { a: { posts: ["new"] } });

    expect(next.get("a")).toEqual({ loaders: { posts: ["new"] }, error: null });
    // Untouched entries stay.
    expect(next.get("b")).toEqual({ loaders: { tags: ["x"] }, error: null });
  });

  test("adds a node not previously present", () => {
    const prior: ResolvedBlockLoaders = new Map();

    const next = mergeLoaderData(prior, { c: { items: [1, 2] } });

    expect(next.get("c")).toEqual({ loaders: { items: [1, 2] }, error: null });
  });

  test("clears a prior error when fresh data arrives for that node", () => {
    const prior: ResolvedBlockLoaders = new Map([
      ["a", { loaders: {}, error: new Error("boom") }],
    ]);

    const next = mergeLoaderData(prior, { a: { posts: [] } });

    expect(next.get("a")).toEqual({ loaders: { posts: [] }, error: null });
  });

  test("returns a new map (does not mutate the prior)", () => {
    const prior: ResolvedBlockLoaders = new Map();

    const next = mergeLoaderData(prior, { a: {} });

    expect(next).not.toBe(prior);
    expect(prior.size).toBe(0);
  });
});

import { describe, expect, test } from "vitest";

import type { BlockNode } from "./render-block-tree.js";
import type { BlockLoaderArgs } from "./loaders.js";
import { collectLoaderEntries, resolveBlockLoaders } from "./loaders.js";
import { createBlockRegistry } from "./block-registry.js";

describe("collectLoaderEntries", () => {
  test("returns empty list when no block in the tree declares loaders", () => {
    const registry = createBlockRegistry([
      { name: "core/heading", render: () => null },
    ]);
    const tree: readonly BlockNode[] = [
      { id: "h1", name: "core/heading", attrs: {} },
    ];

    expect(collectLoaderEntries(tree, registry)).toEqual([]);
  });

  test("recurses into slot-children to find nested loader-bearing blocks", () => {
    const registry = createBlockRegistry([
      { name: "core/group", render: () => null },
      {
        name: "acme/posts",
        render: () => null,
        loaders: { posts: () => Promise.resolve([]) },
      },
    ]);
    const tree: readonly BlockNode[] = [
      {
        id: "g1",
        name: "core/group",
        attrs: {
          children: [
            { id: "nested", name: "acme/posts", attrs: {} },
          ] as readonly BlockNode[],
        },
      },
    ];

    const entries = collectLoaderEntries(tree, registry);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.nodeId).toBe("nested");
  });

  test("emits one entry per block whose spec declares loaders", () => {
    const fetchPosts = () => Promise.resolve([{ id: 1 }]);
    const registry = createBlockRegistry([
      { name: "core/heading", render: () => null },
      {
        name: "acme/posts",
        render: () => null,
        loaders: { posts: fetchPosts },
      },
    ]);
    const tree: readonly BlockNode[] = [
      { id: "h1", name: "core/heading", attrs: {} },
      { id: "p1", name: "acme/posts", attrs: {} },
    ];

    const entries = collectLoaderEntries(tree, registry);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.nodeId).toBe("p1");
    expect(entries[0]?.spec.name).toBe("acme/posts");
  });
});

describe("resolveBlockLoaders", () => {
  test("returns the resolved data keyed by node id", async () => {
    const registry = createBlockRegistry([
      {
        name: "acme/posts",
        render: () => null,
        loaders: { posts: () => Promise.resolve(["a", "b"]) },
      },
    ]);
    const tree: readonly BlockNode[] = [
      { id: "p1", name: "acme/posts", attrs: {} },
    ];

    const resolved = await resolveBlockLoaders(tree, registry, {});

    expect(resolved.get("p1")).toEqual({
      loaders: { posts: ["a", "b"] },
      error: null,
    });
  });

  test("fires every loader on the tree in parallel, not serially", async () => {
    const sleep = (ms: number) =>
      new Promise<number>((r) => setTimeout(() => r(ms), ms));
    const registry = createBlockRegistry([
      {
        name: "acme/slow-a",
        render: () => null,
        loaders: { v: () => sleep(40) },
      },
      {
        name: "acme/slow-b",
        render: () => null,
        loaders: { v: () => sleep(40) },
      },
    ]);
    const tree: readonly BlockNode[] = [
      { id: "a", name: "acme/slow-a", attrs: {} },
      { id: "b", name: "acme/slow-b", attrs: {} },
    ];

    const startedAt = Date.now();
    await resolveBlockLoaders(tree, registry, {});
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeLessThan(80);
  });

  test("isolates a synchronously-thrown loader from sibling blocks", async () => {
    const registry = createBlockRegistry([
      {
        name: "acme/sync-throw",
        render: () => null,
        // Throws before returning a Promise — easy to do by accident
        // when the loader body forgets `await` and dereferences an
        // unexpected null.
        loaders: {
          v: () => {
            throw new Error("sync-fail");
          },
        },
      },
      {
        name: "acme/fine",
        render: () => null,
        loaders: { v: () => Promise.resolve("ok") },
      },
    ]);
    const tree: readonly BlockNode[] = [
      { id: "x", name: "acme/sync-throw", attrs: {} },
      { id: "y", name: "acme/fine", attrs: {} },
    ];

    const resolved = await resolveBlockLoaders(tree, registry, {});

    expect((resolved.get("x")?.error as Error).message).toBe("sync-fail");
    expect(resolved.get("y")?.error).toBeNull();
    expect(resolved.get("y")?.loaders).toEqual({ v: "ok" });
  });

  test("isolates per-block loader rejections from sibling blocks", async () => {
    const registry = createBlockRegistry([
      {
        name: "acme/breaks",
        render: () => null,
        loaders: { v: () => Promise.reject(new Error("nope")) },
      },
      {
        name: "acme/fine",
        render: () => null,
        loaders: { v: () => Promise.resolve("ok") },
      },
    ]);
    const tree: readonly BlockNode[] = [
      { id: "x", name: "acme/breaks", attrs: {} },
      { id: "y", name: "acme/fine", attrs: {} },
    ];

    const resolved = await resolveBlockLoaders(tree, registry, {});

    expect(resolved.get("x")?.error).toBeInstanceOf(Error);
    expect(resolved.get("x")?.loaders).toEqual({});
    expect(resolved.get("y")?.error).toBeNull();
    expect(resolved.get("y")?.loaders).toEqual({ v: "ok" });
  });

  test("invokes onLoaderError for each rejected loader with block context", async () => {
    const events: { name: string; key: string; message: string }[] = [];
    const registry = createBlockRegistry([
      {
        name: "acme/two-loaders",
        render: () => null,
        loaders: {
          ok: () => Promise.resolve("fine"),
          bad: () => Promise.reject(new Error("kaboom")),
        },
      },
    ]);
    const tree: readonly BlockNode[] = [
      { id: "n1", name: "acme/two-loaders", attrs: {} },
    ];

    await resolveBlockLoaders(tree, registry, {}, {
      onLoaderError: ({ spec, key, error }) =>
        events.push({
          name: spec.name,
          key,
          message: (error as Error).message,
        }),
    });

    expect(events).toEqual([
      { name: "acme/two-loaders", key: "bad", message: "kaboom" },
    ]);
  });

  test("passes ctx and node attrs into each loader", async () => {
    let seenCtx: unknown;
    let seenAttrs: unknown;
    const registry = createBlockRegistry([
      {
        name: "acme/echo",
        render: () => null,
        loaders: {
          v: ({ ctx, attrs }: BlockLoaderArgs) => {
            seenCtx = ctx;
            seenAttrs = attrs;
            return Promise.resolve("ok");
          },
        },
      },
    ]);
    const ctx = { request: new Request("https://example.test/?q=foo") };
    const tree: readonly BlockNode[] = [
      { id: "e", name: "acme/echo", attrs: { foo: 1 } },
    ];

    await resolveBlockLoaders(tree, registry, ctx);

    expect(seenCtx).toBe(ctx);
    expect(seenAttrs).toEqual({ foo: 1 });
  });
});

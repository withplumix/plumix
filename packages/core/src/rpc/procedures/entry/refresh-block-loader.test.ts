import { describe, expect, test } from "vitest";

import { createPluginRegistry } from "../../../plugin/manifest.js";
import { createRpcHarness } from "../../../test/rpc.js";

// A registry with a public post type and a loader-backed block.
function loaderRegistry() {
  const registry = createPluginRegistry();
  registry.entryTypes.set("post", {
    name: "post",
    registeredBy: "test",
    label: "Posts",
    capabilityType: "post",
    isPublic: true,
  });
  registry.blockSpecs.set("test/feed", {
    spec: {
      name: "test/feed",
      render: () => null,
      loaders: {
        // Echo an attr so the test can prove the loader actually re-ran against
        // the block's current attrs.
        items: ({ attrs }) => Promise.resolve({ count: attrs.count }),
      },
    },
    registeredBy: "test",
  });
  return registry;
}

const content = (count: number) => ({
  version: "plumix.v2" as const,
  blocks: [{ id: "feed1", name: "test/feed", attrs: { count } }],
});

describe("entry.refreshBlockLoader", () => {
  test("re-runs a single block's loader and returns its data", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: loaderRegistry(),
    });
    const draft = await h.factory.draft.create({
      authorId: h.user.id,
      content: content(7),
    });

    const result = await h.client.entry.refreshBlockLoader({
      id: draft.id,
      blockId: "feed1",
    });

    expect(result.data).toEqual({ feed1: { items: { count: 7 } } });
  });

  test("404s an unknown block id", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: loaderRegistry(),
    });
    const draft = await h.factory.draft.create({
      authorId: h.user.id,
      content: content(1),
    });

    await expect(
      h.client.entry.refreshBlockLoader({ id: draft.id, blockId: "nope" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("404s a draft the caller can't read", async () => {
    const h = await createRpcHarness({
      authAs: "contributor",
      plugins: loaderRegistry(),
    });
    const other = await h.factory.user.create();
    const draft = await h.factory.draft.create({
      authorId: other.id,
      content: content(1),
    });

    await expect(
      h.client.entry.refreshBlockLoader({ id: draft.id, blockId: "feed1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

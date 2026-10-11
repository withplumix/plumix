import { describe, expect, test, vi } from "vitest";

import { createPluginRegistry } from "../../../plugin/manifest.js";
import { toRegisteredEntryType } from "../../../plugin/registry.js";
import { createRpcHarness } from "../../../test/rpc.js";

/** A post type, a location-keyed dep and a block reading it from its attrs. */
function navRegistry() {
  const registry = createPluginRegistry();
  registry.entryTypes.set(
    "post",
    toRegisteredEntryType(
      "post",
      { label: "Posts", capabilityType: "post", isPublic: true },
      "test",
    ),
  );
  const load = vi.fn((locations: readonly string[]) =>
    Promise.resolve(Object.fromEntries(locations.map((l) => [l, `menu:${l}`]))),
  );
  registry.templateDeps.set("menus", {
    kind: "menus",
    registeredBy: "test",
    load,
  });
  registry.blockSpecs.set("test/nav", {
    spec: {
      name: "test/nav",
      render: () => null,
      deps: (attrs) => ({ menus: [String(attrs.location)] }),
    },
    registeredBy: "test",
  });
  return { registry, load };
}

const tree = (...locations: string[]) => ({
  version: "plumix.v2" as const,
  blocks: locations.map((location, i) => ({
    id: `nav${String(i)}`,
    name: "test/nav",
    attrs: { location },
  })),
});

describe("entry.resolveBlockDeps", () => {
  test("loads what the sent tree's blocks declare, from their current attrs", async () => {
    const { registry, load } = navRegistry();
    const h = await createRpcHarness({ authAs: "editor", plugins: registry });
    const draft = await h.factory.draft.create({
      authorId: h.user.id,
      content: tree("header"),
    });

    const result = await h.client.entry.resolveBlockDeps({
      id: draft.id,
      content: tree("header", "footer"),
    });

    expect(result.deps).toEqual({
      menus: { header: "menu:header", footer: "menu:footer" },
    });
    expect(load).toHaveBeenCalledOnce();
  });

  test("404s an entry the caller can't read", async () => {
    const { registry } = navRegistry();
    const h = await createRpcHarness({
      authAs: "contributor",
      plugins: registry,
    });
    const other = await h.factory.user.create();
    const draft = await h.factory.draft.create({
      authorId: other.id,
      content: tree("header"),
    });

    await expect(
      h.client.entry.resolveBlockDeps({
        id: draft.id,
        content: tree("header"),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

import { describe, expect, test } from "vitest";

import type { UserRole } from "../../../db/schema/users.js";
import type {
  MetaBoxField,
  MutablePluginRegistry,
} from "../../../plugin/manifest.js";
import { createPluginRegistry } from "../../../plugin/manifest.js";
import { createRpcHarness } from "../../../test/rpc.js";

function taxonomyRegistry(): MutablePluginRegistry {
  const registry = createPluginRegistry();
  registry.termTaxonomies.set("category", {
    name: "category",
    label: "Categories",
    registeredBy: "test",
  });
  const caps: Record<string, UserRole> = {
    "term:category:read": "subscriber",
    "term:category:assign": "contributor",
    "term:category:edit": "editor",
    "term:category:delete": "editor",
  };
  for (const [name, minRole] of Object.entries(caps)) {
    registry.capabilities.set(name, { name, minRole, registeredBy: "test" });
  }
  return registry;
}

function registerTermMetaFields(
  plugins: MutablePluginRegistry,
  taxonomy: string,
  fields: MetaBoxField[],
): void {
  plugins.termMetaBoxes.set(`test-${taxonomy}`, {
    id: `test-${taxonomy}`,
    label: "Test",
    termTaxonomies: [taxonomy],
    fields,
    registeredBy: "test",
  });
}

describe("term meta: registration + round-trip via term.update", () => {
  test("registered meta keys persist through term.create + term.get", async () => {
    const plugins = taxonomyRegistry();
    registerTermMetaFields(plugins, "category", [
      { key: "icon_url", label: "Icon URL", type: "string", inputType: "url" },
      {
        key: "featured",
        label: "Featured",
        type: "boolean",
        inputType: "checkbox",
      },
    ]);
    const h = await createRpcHarness({ authAs: "admin", plugins });

    const created = await h.client.term.create({
      taxonomy: "category",
      name: "News",
      slug: "news",
      meta: { icon_url: "https://example.test/news.svg", featured: true },
    });
    expect(created.meta).toEqual({
      icon_url: "https://example.test/news.svg",
      featured: true,
    });

    const reloaded = await h.client.term.get({ id: created.id });
    expect(reloaded.meta).toEqual({
      icon_url: "https://example.test/news.svg",
      featured: true,
    });
  });

  test("unregistered meta key is rejected with CONFLICT", async () => {
    const plugins = taxonomyRegistry();
    const h = await createRpcHarness({ authAs: "admin", plugins });

    await expect(
      h.client.term.create({
        taxonomy: "category",
        name: "News",
        slug: "news",
        meta: { mystery: "x" },
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_not_registered", key: "mystery" },
    });
  });

  test("term.update partial patch + null-delete semantics match entry.meta", async () => {
    const plugins = taxonomyRegistry();
    registerTermMetaFields(plugins, "category", [
      { key: "icon_url", label: "Icon URL", type: "string", inputType: "url" },
      {
        key: "featured",
        label: "Featured",
        type: "boolean",
        inputType: "checkbox",
      },
    ]);
    const h = await createRpcHarness({ authAs: "admin", plugins });

    const created = await h.client.term.create({
      taxonomy: "category",
      name: "Tech",
      slug: "tech",
      meta: { icon_url: "https://example.test/tech.svg", featured: false },
    });

    // Partial patch: only `featured` is touched; `icon_url` survives.
    const afterFlip = await h.client.term.update({
      id: created.id,
      meta: { featured: true },
    });
    expect(afterFlip.meta).toEqual({
      icon_url: "https://example.test/tech.svg",
      featured: true,
    });

    // Null deletes the key.
    const afterClear = await h.client.term.update({
      id: created.id,
      meta: { icon_url: null },
    });
    expect(afterClear.meta).toEqual({ featured: true });
  });

  test("key registered on a different taxonomy → meta_not_registered for the other scope", async () => {
    const plugins = taxonomyRegistry();
    plugins.termTaxonomies.set("tag", {
      name: "tag",
      label: "Tags",
      registeredBy: "test",
    });
    const tagCaps: Record<string, UserRole> = {
      "term:tag:read": "subscriber",
      "term:tag:edit": "editor",
    };
    for (const [name, minRole] of Object.entries(tagCaps)) {
      plugins.capabilities.set(name, { name, minRole, registeredBy: "test" });
    }
    registerTermMetaFields(plugins, "tag", [
      { key: "color", label: "Color", type: "string", inputType: "text" },
    ]);
    const h = await createRpcHarness({ authAs: "admin", plugins });

    await expect(
      h.client.term.create({
        taxonomy: "category",
        name: "News",
        slug: "news",
        meta: { color: "red" },
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_not_registered", key: "color" },
    });
  });

  test("term.update with an empty meta patch does not fire term:meta_changed", async () => {
    const plugins = taxonomyRegistry();
    registerTermMetaFields(plugins, "category", [
      { key: "icon_url", label: "Icon URL", type: "string", inputType: "url" },
    ]);
    const h = await createRpcHarness({ authAs: "admin", plugins });

    const created = await h.client.term.create({
      taxonomy: "category",
      name: "Travel",
      slug: "travel",
    });
    const spy = h.spyAction("term:meta_changed");

    await h.client.term.update({ id: created.id, meta: {} });

    expect(spy.calls).toHaveLength(0);
  });

  test("term:meta_changed fires with the upsert + delete diff", async () => {
    const plugins = taxonomyRegistry();
    registerTermMetaFields(plugins, "category", [
      { key: "icon_url", label: "Icon URL", type: "string", inputType: "url" },
    ]);
    const h = await createRpcHarness({ authAs: "admin", plugins });

    const created = await h.client.term.create({
      taxonomy: "category",
      name: "Travel",
      slug: "travel",
    });
    const spy = h.spyAction("term:meta_changed");

    await h.client.term.update({
      id: created.id,
      meta: { icon_url: "https://example.test/travel.svg" },
    });
    await h.client.term.update({
      id: created.id,
      meta: { icon_url: null },
    });

    expect(spy.calls).toHaveLength(2);
    expect(spy.calls[0]?.args[1]).toEqual({
      set: { icon_url: "https://example.test/travel.svg" },
      removed: [],
    });
    expect(spy.calls[1]?.args[1]).toEqual({
      set: {},
      removed: ["icon_url"],
    });
  });
});

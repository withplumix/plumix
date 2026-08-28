import type { DispatcherHarness } from "plumix/test";
import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness } from "plumix/test";
import { describe, expect, test } from "vitest";

import type { SeoOptions } from "./index.js";
import { seo } from "./index.js";
import { SEO_META_KEYS } from "./overrides.js";

// One public entry type and one internal one, plus a public taxonomy and a
// private one — the four cases scope derivation has to separate.
const contentPlugin = definePlugin("content", (ctx) => {
  ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  ctx.registerEntryType("page", { label: "Pages", isPublic: true });
  ctx.registerEntryType("nav_item", { label: "Menu items", isPublic: false });
  ctx.registerTermTaxonomy("category", {
    label: "Categories",
    isHierarchical: false,
    entryTypes: ["post"],
  });
  ctx.registerTermTaxonomy("nav_group", {
    label: "Menu groups",
    isHierarchical: false,
    isPublic: false,
    entryTypes: ["nav_item"],
  });
});

function createHarness(options?: SeoOptions): Promise<DispatcherHarness> {
  return createDispatcherHarness({ plugins: [contentPlugin, seo(options)] });
}

function entryBoxScope(h: DispatcherHarness): readonly string[] | undefined {
  return [...h.app.plugins.entryMetaBoxes.values()].find(
    (box) => box.registeredBy === "seo",
  )?.entryTypes;
}

function termBoxScope(h: DispatcherHarness): readonly string[] | undefined {
  return [...h.app.plugins.termMetaBoxes.values()].find(
    (box) => box.registeredBy === "seo",
  )?.termTaxonomies;
}

describe("a registry name that cannot be a settings key", () => {
  test("costs that type its per-type fields, not the boot", async () => {
    const oddly = definePlugin("oddly-named", (ctx) => {
      // Core validates neither entry-type nor taxonomy names, so this
      // registers fine and must not take the app down when SEO installs.
      ctx.registerEntryType("my type", { label: "Odd", isPublic: true });
      ctx.registerEntryType("fine", { label: "Fine", isPublic: true });
    });

    const h = await createDispatcherHarness({ plugins: [oddly, seo()] });

    const group = h.app.plugins.settingsGroups.get("seo");
    const keys = group?.fields.map((field) => field.key) ?? [];
    expect(keys).toContain("type:fine:title");
    expect(keys.some((key) => key.includes("my type"))).toBe(false);
  });
});

describe("SEO meta box scope", () => {
  test("covers publicly visible entry types and no others", async () => {
    const h = await createHarness();

    expect(entryBoxScope(h)).toEqual(["post", "page"]);
  });

  test("covers publicly visible taxonomies and no others", async () => {
    const h = await createHarness();

    expect(termBoxScope(h)).toEqual(["category"]);
  });

  test("a per-type exclusion removes the box from that type alone", async () => {
    const h = await createHarness({ metaBox: { exclude: ["page"] } });

    expect(entryBoxScope(h)).toEqual(["post"]);
    expect(termBoxScope(h)).toEqual(["category"]);
  });

  test("a taxonomy can be excluded the same way", async () => {
    const h = await createHarness({ metaBox: { exclude: ["category"] } });

    expect(termBoxScope(h)).toBeUndefined();
    expect(entryBoxScope(h)).toEqual(["post", "page"]);
  });

  test("the box carries the whole prefixed field set", async () => {
    const h = await createHarness();

    const box = [...h.app.plugins.entryMetaBoxes.values()].find(
      (candidate) => candidate.registeredBy === "seo",
    );
    expect(box?.fields.map((field) => field.key)).toEqual(
      Object.values(SEO_META_KEYS),
    );
  });
});

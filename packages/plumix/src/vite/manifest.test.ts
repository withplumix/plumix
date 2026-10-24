import { describe, expect, test } from "vitest";

import { definePlugin, defineTheme } from "@plumix/core";

import { computeManifestAndRegistry } from "./manifest.js";

const theme = defineTheme({ templates: () => null });

const OPTIONS = {
  theme,
  routes: { author: true, date: true, search: true },
} as const;

function metaBox(id: string, entryTypes: readonly string[]) {
  return {
    label: id,
    entryTypes,
    fields: [
      { key: `${id}_field`, type: "string", inputType: "text", label: "Field" },
    ],
  } as const;
}

/**
 * Derives its registration from the registry, which only works once every
 * plugin has registered.
 */
const derived = definePlugin("derived", {
  setup: () => undefined,
  afterSetup: (ctx) => {
    const types = [...ctx.plugins.entryTypes.keys()];
    ctx.registerEntryMetaBox("derived", metaBox("derived", types));
  },
});

/**
 * Registered after the consumer above, so `setup` order alone cannot see it.
 */
const content = definePlugin("content", (ctx) => {
  ctx.registerEntryType("post", { label: "Posts", isPublic: true });
});

describe("computeManifestAndRegistry", () => {
  test("a box derived in afterSetup reaches the built manifest", async () => {
    // Regression: the admin manifest is built here, not at boot, so a
    // registration deferred past `setup` was shipped as an empty list while the
    // running worker had it.
    const { manifest } = await computeManifestAndRegistry(
      [derived, content],
      OPTIONS,
    );

    const box = (manifest.entryMetaBoxes ?? []).find(
      (entry) => entry.id === "derived",
    );
    expect(box?.entryTypes).toEqual(["post"]);
  });

  test("a box registered on theme:ready reaches the built manifest", async () => {
    const handover = definePlugin("handover", (ctx) => {
      ctx.addAction("theme:ready", () => {
        ctx.registerEntryMetaBox("handover", metaBox("handover", ["post"]));
      });
    });

    const { manifest } = await computeManifestAndRegistry(
      [handover, content],
      OPTIONS,
    );

    expect((manifest.entryMetaBoxes ?? []).map((entry) => entry.id)).toContain(
      "handover",
    );
  });

  test("the registry it hands back carries the same registration", async () => {
    const { registry } = await computeManifestAndRegistry(
      [derived, content],
      OPTIONS,
    );

    expect(registry.entryMetaBoxes.get("derived")?.entryTypes).toEqual([
      "post",
    ]);
  });

  test("the site's routes reach both the registry and the manifest", async () => {
    const routes = { author: false, date: false, search: true };
    const { manifest, registry } = await computeManifestAndRegistry([content], {
      ...OPTIONS,
      routes,
    });

    expect(registry.frameworkRoutes).toEqual(routes);
    expect(manifest.frameworkRoutes).toEqual({ author: false });
  });

  test("a first-party plugin publishes its catalogs like any installed one", async () => {
    // The admin bundle reads no plugin's catalogs at build time, so turbo has
    // no hidden edge from admin's build to every plugin's i18n:compile.
    const workspace = definePlugin("workspace", {
      i18n: {
        sourceLocale: "en",
        locales: ["en", "de"],
        catalogPath: "./locales",
      },
      setup: () => undefined,
    });

    const { manifest } = await computeManifestAndRegistry([workspace], OPTIONS);

    expect(manifest.pluginI18n).toEqual({
      workspace: {
        sourceLocale: "en",
        catalogs: {
          en: "/_plumix/admin/plugins/workspace/locales/en.mjs",
          de: "/_plumix/admin/plugins/workspace/locales/de.mjs",
        },
      },
    });
  });

  test("the manifest allows only the blocks the theme lists", async () => {
    const { manifest } = await computeManifestAndRegistry([], {
      ...OPTIONS,
      theme: defineTheme({
        templates: () => null,
        allowedBlocks: ["core/rich-text"],
      }),
    });

    expect(manifest.allowedBlocks).toEqual(["core/rich-text"]);
  });
});

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, onTestFinished, test } from "vitest";

import { definePlugin, defineTheme, resolveLocales } from "@plumix/core";

import { computeManifestAndRegistry } from "./manifest.js";

const theme = defineTheme({ templates: () => null });

const OPTIONS = {
  theme,
  projectRoot: tmpdir(),
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
const content = definePlugin("content", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  },
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

  test("setup and afterSetup see the configured theme", async () => {
    const seen: unknown[] = [];
    const reader = definePlugin("reader", {
      setup: (ctx) => {
        seen.push(ctx.theme);
      },
      afterSetup: (ctx) => {
        seen.push(ctx.theme);
      },
    });

    await computeManifestAndRegistry([reader], OPTIONS);

    expect(seen).toEqual([theme, theme]);
  });

  test("a box registered from the theme in setup reaches the built manifest", async () => {
    const themed = defineTheme({
      templates: () => null,
      allowCustomStyles: false,
    });
    const themedBox = definePlugin("themed-box", {
      setup: (ctx) => {
        if (ctx.theme.allowCustomStyles === false) {
          ctx.registerEntryMetaBox("handover", metaBox("handover", ["post"]));
        }
      },
    });

    const { manifest } = await computeManifestAndRegistry(
      [themedBox, content],
      {
        ...OPTIONS,
        theme: themed,
      },
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

  test("publishes the catalogs a plugin compiled under its catalogPath, with no declared locales", async () => {
    const catalogPath = await mkdtemp(join(tmpdir(), "plumix-catalogs-"));
    onTestFinished(() => rm(catalogPath, { recursive: true, force: true }));
    for (const locale of ["en", "pt-BR"]) {
      await writeFile(
        join(catalogPath, `${locale}.mjs`),
        "export const messages = {};\n",
      );
    }
    const translated = definePlugin("translated", {
      i18n: { sourceLocale: "en", catalogPath },
      setup: () => undefined,
    });

    const { manifest } = await computeManifestAndRegistry([translated], {
      ...OPTIONS,
      i18n: resolveLocales({ defaultLocale: "en", locales: ["en", "pt-BR"] }),
    });

    expect(manifest.pluginI18n).toEqual({
      translated: {
        sourceLocale: "en",
        catalogs: {
          en: "/_plumix/admin/plugins/translated/locales/en.mjs",
          "pt-BR": "/_plumix/admin/plugins/translated/locales/pt-BR.mjs",
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

  test("the manifest carries the theme's allowCustomStyles", async () => {
    const { manifest } = await computeManifestAndRegistry([], {
      ...OPTIONS,
      theme: defineTheme({
        templates: () => null,
        allowCustomStyles: false,
      }),
    });

    expect(manifest.allowCustomStyles).toBe(false);
  });
});

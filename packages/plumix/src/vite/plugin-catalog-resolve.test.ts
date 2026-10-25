import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import type { ResolvedI18n, ResolvedLocale } from "@plumix/core";
import {
  buildManifest,
  createPluginRegistry,
  definePlugin,
  pluginCatalogStagedPath,
} from "@plumix/core";

import {
  collectPluginCatalogFiles,
  findPluginPackageRoot,
  stagePluginCatalogs,
} from "./plugin-catalog-resolve.js";

const EN: ResolvedLocale = {
  code: "en",
  label: "English",
  direction: "ltr",
  enabled: true,
};
const UK: ResolvedLocale = {
  code: "uk",
  label: "Ukrainian",
  direction: "ltr",
  enabled: true,
};
const DE: ResolvedLocale = {
  code: "de",
  label: "German",
  direction: "ltr",
  enabled: true,
};

const DE_AT: ResolvedLocale = {
  code: "de-AT",
  label: "German (Austria)",
  direction: "ltr",
  enabled: true,
};

describe("findPluginPackageRoot", () => {
  test("resolves via the `@plumix/plugin-<id>` convention", () => {
    const requireFrom = makeRequireFrom({
      "@plumix/plugin-pages/package.json":
        "/site/node_modules/@plumix/plugin-pages/package.json",
    });
    const root = findPluginPackageRoot({
      pluginId: "pages",
      projectRoot: "/site",
      requireFrom,
    });
    expect(root).toBe("/site/node_modules/@plumix/plugin-pages");
  });

  test("falls back to `plumix-plugin-<id>` when the @plumix scope misses", () => {
    const requireFrom = makeRequireFrom({
      "plumix-plugin-translate/package.json":
        "/site/node_modules/plumix-plugin-translate/package.json",
    });
    const root = findPluginPackageRoot({
      pluginId: "translate",
      projectRoot: "/site",
      requireFrom,
    });
    expect(root).toBe("/site/node_modules/plumix-plugin-translate");
  });

  // `PLUGIN_ID_RE` admits `_` while npm names use `-`, and nothing else
  // reconciles them.
  test("falls back to the hyphenated name for an id carrying an underscore", () => {
    const requireFrom = makeRequireFrom({
      "@plumix/plugin-audit-log/package.json":
        "/site/node_modules/@plumix/plugin-audit-log/package.json",
    });
    const root = findPluginPackageRoot({
      pluginId: "audit_log",
      projectRoot: "/site",
      requireFrom,
    });
    expect(root).toBe("/site/node_modules/@plumix/plugin-audit-log");
  });

  test("prefers a package whose name keeps the underscore verbatim", () => {
    // The literal id is tried first, so a package that really is named with `_`
    // still wins over the hyphenated fallback.
    const requireFrom = makeRequireFrom({
      "@plumix/plugin-odd_name/package.json":
        "/site/node_modules/@plumix/plugin-odd_name/package.json",
      "@plumix/plugin-odd-name/package.json":
        "/site/node_modules/@plumix/plugin-odd-name/package.json",
    });
    const root = findPluginPackageRoot({
      pluginId: "odd_name",
      projectRoot: "/site",
      requireFrom,
    });
    expect(root).toBe("/site/node_modules/@plumix/plugin-odd_name");
  });

  test("returns null when no naming convention resolves", () => {
    const requireFrom = makeRequireFrom({});
    const root = findPluginPackageRoot({
      pluginId: "phantom",
      projectRoot: "/site",
      requireFrom,
    });
    expect(root).toBeNull();
  });
});

// The seam tests don't exercise Node's `exports` enforcement
// (`ERR_PACKAGE_PATH_NOT_EXPORTED`), which only real resolution applies.
describe("plugin catalog resolution — real FS", () => {
  let projectRoot: string;

  beforeEach(async () => {
    // `realpath` because macOS tmpdir symlinks `/var/folders` →
    // `/private/var/folders`; Node's resolver canonicalizes, so the
    // returned root would otherwise differ from `pluginDir` literal.
    projectRoot = await realpath(
      await mkdtemp(join(tmpdir(), "plumix-plugin-resolve-")),
    );
    await writeFile(join(projectRoot, "package.json"), JSON.stringify({}));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  test("resolves a real `@plumix/plugin-<id>` package via exports.['./package.json']", async () => {
    const pluginDir = join(projectRoot, "node_modules/@plumix/plugin-real");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(
      join(pluginDir, "package.json"),
      JSON.stringify({
        name: "@plumix/plugin-real",
        type: "module",
        exports: { "./package.json": "./package.json" },
      }),
    );

    const root = findPluginPackageRoot({ pluginId: "real", projectRoot });
    expect(root).toBe(pluginDir);
  });
  test("returns null when a plugin package omits exports.['./package.json']", async () => {
    // Regression pin: if a plugin author forgets to expose the
    // subpath, Node throws `ERR_PACKAGE_PATH_NOT_EXPORTED` and the
    // resolver must return null — silently fall through to the loud-
    // failure path in `stagePluginCatalogs`.
    const pluginDir = join(projectRoot, "node_modules/@plumix/plugin-locked");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(
      join(pluginDir, "package.json"),
      JSON.stringify({
        name: "@plumix/plugin-locked",
        type: "module",
        exports: { ".": "./index.js" },
      }),
    );

    const root = findPluginPackageRoot({ pluginId: "locked", projectRoot });
    expect(root).toBeNull();
  });
});

// Every other test here stops at resolution and never copies, leaving the
// manifest-driven half of the pipeline uncovered.
describe("stagePluginCatalogs — real FS", () => {
  let projectRoot: string;
  let dest: string;

  const SITE_I18N = {
    defaultLocale: EN,
    locales: [EN, UK, { ...DE, enabled: false }],
  };

  beforeEach(async () => {
    projectRoot = await realpath(
      await mkdtemp(join(tmpdir(), "plumix-catalog-stage-")),
    );
    await writeFile(join(projectRoot, "package.json"), JSON.stringify({}));
    dest = join(projectRoot, "dist/_plumix/admin");
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  async function installPlugin(locales: readonly string[]): Promise<void> {
    const pluginDir = join(projectRoot, "node_modules/@plumix/plugin-vendor");
    await mkdir(join(pluginDir, "locales"), { recursive: true });
    await writeFile(
      join(pluginDir, "package.json"),
      JSON.stringify({
        name: "@plumix/plugin-vendor",
        type: "module",
        exports: { "./package.json": "./package.json" },
      }),
    );
    for (const locale of locales) {
      await writeFile(
        join(pluginDir, "locales", `${locale}.mjs`),
        `export const messages = ${JSON.stringify({ "vendor.hello": locale })};\n`,
      );
    }
  }

  function stage(
    declared: readonly string[],
    i18n: ResolvedI18n = SITE_I18N,
  ): Promise<void> {
    const plugin = definePlugin("vendor", {
      setup: () => undefined,
      i18n: {
        sourceLocale: "en",
        locales: declared,
        catalogPath: "./locales",
      },
    });
    const manifest = buildManifest(createPluginRegistry(), {
      plugins: [plugin],
      i18n,
    });
    return stagePluginCatalogs(dest, [plugin], manifest, projectRoot);
  }

  test("copies a declared, site-enabled locale into the staged admin dist", async () => {
    await installPlugin(["en", "uk", "de"]);
    await stage(["en", "uk", "de"]);

    const staged = join(dest, pluginCatalogStagedPath("vendor", "uk"));
    expect(await readFile(staged, "utf8")).toContain('"vendor.hello":"uk"');
  });

  test("stages the catalog an enabled regional locale reads", async () => {
    await installPlugin(["en", "de"]);
    await stage(["en", "de"], {
      defaultLocale: DE_AT,
      locales: [DE_AT],
    });

    const staged = join(dest, pluginCatalogStagedPath("vendor", "de"));
    expect(await readFile(staged, "utf8")).toContain('"vendor.hello":"de"');
  });

  test("skips a locale the site has not enabled", async () => {
    await installPlugin(["en", "uk", "de"]);
    await stage(["en", "uk", "de"]);

    // `de` is declared but disabled by the site, so the intersection drops it.
    expect(
      existsSync(join(dest, pluginCatalogStagedPath("vendor", "de"))),
    ).toBe(false);
  });

  test("stages the source catalog even when the slot declares nothing else", async () => {
    // The admin falls back to it for every locale the plugin doesn't ship.
    await installPlugin(["en", "uk", "de"]);
    await stage(["en"]);

    expect(
      existsSync(join(dest, pluginCatalogStagedPath("vendor", "en"))),
    ).toBe(true);
  });

  test("a missing catalog fails the build before any catalog is staged", async () => {
    await installPlugin(["en"]);

    await expect(stage(["en", "uk"])).rejects.toThrow(/uk/);
    expect(
      existsSync(join(dest, pluginCatalogStagedPath("vendor", "en"))),
    ).toBe(false);
  });

  test("throws adminAssetNotFound when a declared locale has no compiled catalog", async () => {
    // `buildManifest` has already committed to a URL admin will fetch, so a
    // missing `.mjs` has to fail the build rather than 404 in production.
    await installPlugin(["en"]);
    await expect(stage(["en", "uk"])).rejects.toThrow(/uk/);
  });
});

/**
 * Minimal createRequire stub for resolution tests. Maps known package
 * specifiers to their resolved absolute paths; unknown specifiers
 * throw the same MODULE_NOT_FOUND shape Node's resolver emits, which
 * the resolver branches on.
 */
function makeRequireFrom(
  resolutions: Readonly<Record<string, string>>,
): (filename: string) => { resolve: (id: string) => string } {
  return () => ({
    resolve: (id: string): string => {
      const hit = resolutions[id];
      if (hit !== undefined) return hit;
      throw Object.assign(new Error(`Cannot find module '${id}'`), {
        code: "MODULE_NOT_FOUND",
      });
    },
  });
}

describe("collectPluginCatalogFiles — real FS", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await realpath(
      await mkdtemp(join(tmpdir(), "plumix-catalog-collect-")),
    );
    await writeFile(join(projectRoot, "package.json"), JSON.stringify({}));
    const pluginDir = join(projectRoot, "node_modules/@plumix/plugin-vendor");
    await mkdir(join(pluginDir, "locales"), { recursive: true });
    await writeFile(
      join(pluginDir, "package.json"),
      JSON.stringify({ name: "@plumix/plugin-vendor", type: "module" }),
    );
    for (const locale of ["en", "de"]) {
      await writeFile(
        join(pluginDir, "locales", `${locale}.mjs`),
        "export const messages = {};\n",
      );
    }
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  test("lists every declared locale's compiled catalog by locale, marking the source locale and skipping any not on disk", async () => {
    const vendor = definePlugin("vendor", {
      setup: () => undefined,
      i18n: {
        sourceLocale: "en",
        locales: ["en", "de", "uk"],
        catalogPath: "./locales",
      },
    });
    const bare = definePlugin("bare", { setup: () => undefined });

    const files = await collectPluginCatalogFiles(
      [vendor, bare],
      ["en", "de"],
      projectRoot,
    );

    const locales = join(
      projectRoot,
      "node_modules/@plumix/plugin-vendor/locales",
    );
    expect(Object.fromEntries(files)).toEqual({
      en: [{ path: join(locales, "en.mjs"), source: true }],
      de: [{ path: join(locales, "de.mjs"), source: false }],
    });
  });

  test("an enabled locale whose declared catalog is not compiled reads the source catalog", async () => {
    const vendor = definePlugin("vendor", {
      setup: () => undefined,
      i18n: {
        sourceLocale: "en",
        locales: ["en", "uk"],
        catalogPath: "./locales",
      },
    });

    const files = await collectPluginCatalogFiles(
      [vendor],
      ["uk"],
      projectRoot,
    );

    const locales = join(
      projectRoot,
      "node_modules/@plumix/plugin-vendor/locales",
    );
    expect(files.get("uk")).toEqual([
      { path: join(locales, "en.mjs"), source: true },
    ]);
  });

  test("a plugin whose source catalog is not compiled serves nothing for the locales that read it", async () => {
    await rm(
      join(projectRoot, "node_modules/@plumix/plugin-vendor/locales/en.mjs"),
    );
    const vendor = definePlugin("vendor", {
      setup: () => undefined,
      i18n: {
        sourceLocale: "en",
        locales: ["en", "de"],
        catalogPath: "./locales",
      },
    });

    const files = await collectPluginCatalogFiles(
      [vendor],
      ["de", "fr"],
      projectRoot,
    );

    expect([...files.keys()]).toEqual(["de"]);
  });

  test("keys each catalog by the enabled locale it serves, the source catalog included", async () => {
    const vendor = definePlugin("vendor", {
      setup: () => undefined,
      i18n: {
        sourceLocale: "en",
        locales: ["en", "de"],
        catalogPath: "./locales",
      },
    });

    const files = await collectPluginCatalogFiles(
      [vendor],
      ["de-AT", "fr"],
      projectRoot,
    );

    const locales = join(
      projectRoot,
      "node_modules/@plumix/plugin-vendor/locales",
    );
    expect(Object.fromEntries(files)).toEqual({
      en: [{ path: join(locales, "en.mjs"), source: true }],
      "de-AT": [{ path: join(locales, "de.mjs"), source: false }],
      fr: [{ path: join(locales, "en.mjs"), source: true }],
    });
  });
});

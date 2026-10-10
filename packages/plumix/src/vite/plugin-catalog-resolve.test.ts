import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import type { ResolvedLocale } from "@plumix/core";
import {
  buildManifest,
  createPluginRegistry,
  definePlugin,
  pluginCatalogStagedPath,
} from "@plumix/core";

import {
  collectPluginCatalogFiles,
  findAdminBundledPluginsDir,
  findPluginPackageRoot,
  isAdminBundledPlugin,
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
  let bundledPluginsDir: string;

  beforeEach(async () => {
    // `realpath` because macOS tmpdir symlinks `/var/folders` →
    // `/private/var/folders`; Node's resolver canonicalizes, so the
    // returned root would otherwise differ from `pluginDir` literal.
    projectRoot = await realpath(
      await mkdtemp(join(tmpdir(), "plumix-plugin-resolve-")),
    );
    // Present, so a case expecting `false` earns it on the comparison rather
    // than a missing directory.
    bundledPluginsDir = join(projectRoot, "packages/plugins");
    await mkdir(bundledPluginsDir, { recursive: true });
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

  test("isAdminBundledPlugin returns true for a symlink into admin's bundled plugins dir", async () => {
    // The plumix monorepo: pnpm links `node_modules/@plumix/plugin-real`
    // straight at `packages/plugins/real`, which is exactly what admin's
    // `import.meta.glob("../../../plugins/*/locales/*.mjs")` baked in.
    const pluginDir = join(bundledPluginsDir, "real");
    await mkdir(pluginDir, { recursive: true });
    await linkPlugin(projectRoot, "real", pluginDir);

    expect(
      isAdminBundledPlugin({
        pluginId: "real",
        projectRoot,
        bundledPluginsDir,
      }),
    ).toBe(true);
  });

  test("isAdminBundledPlugin returns false for a pnpm store symlink (registry install)", async () => {
    // Under pnpm every `node_modules` entry is a symlink, registry tarballs
    // included, so symlink-ness alone can't mean "workspace".
    const storeDir = join(
      projectRoot,
      "node_modules/.pnpm/@plumix+plugin-published@0.1.0/node_modules/@plumix/plugin-published",
    );
    await mkdir(storeDir, { recursive: true });
    await linkPlugin(projectRoot, "published", storeDir);

    expect(
      isAdminBundledPlugin({
        pluginId: "published",
        projectRoot,
        bundledPluginsDir,
      }),
    ).toBe(false);
  });

  test("isAdminBundledPlugin returns false for a symlink to a local plugin outside the bundled dir", async () => {
    // `pnpm link` / `file:` deps also produce a symlink, but to a directory
    // admin's glob never scanned.
    const localDir = join(projectRoot, "vendor/my-plugin");
    await mkdir(localDir, { recursive: true });
    await linkPlugin(projectRoot, "local", localDir);

    expect(
      isAdminBundledPlugin({
        pluginId: "local",
        projectRoot,
        bundledPluginsDir,
      }),
    ).toBe(false);
  });

  test("isAdminBundledPlugin returns false for a real (non-symlink) install", async () => {
    await mkdir(join(projectRoot, "node_modules/@plumix/plugin-vendor"), {
      recursive: true,
    });

    expect(
      isAdminBundledPlugin({
        pluginId: "vendor",
        projectRoot,
        bundledPluginsDir,
      }),
    ).toBe(false);
  });

  test("isAdminBundledPlugin returns false off the monorepo, where nothing is baked in", async () => {
    // A consumer site: no admin-bundled plugins dir, so nothing is bundled,
    // even a link landing in the site's own `packages/plugins`.
    const pluginDir = join(bundledPluginsDir, "real");
    await mkdir(pluginDir, { recursive: true });
    await linkPlugin(projectRoot, "real", pluginDir);

    expect(
      isAdminBundledPlugin({
        pluginId: "real",
        projectRoot,
        bundledPluginsDir: null,
      }),
    ).toBe(false);
  });

  test("isAdminBundledPlugin returns false when the package isn't found at all", () => {
    expect(
      isAdminBundledPlugin({
        pluginId: "ghost",
        projectRoot,
        bundledPluginsDir,
      }),
    ).toBe(false);
  });

  test("findAdminBundledPluginsDir resolves the admin package's sibling", async () => {
    const adminRoot = join(projectRoot, "packages/admin");
    await mkdir(adminRoot, { recursive: true });

    expect(findAdminBundledPluginsDir(adminRoot)).toBe(bundledPluginsDir);
  });

  test("findAdminBundledPluginsDir returns null when the sibling doesn't exist", async () => {
    // An installed `@plumix/admin`, whose siblings are other npm packages.
    const adminRoot = join(projectRoot, "node_modules/@plumix/admin");
    await mkdir(adminRoot, { recursive: true });

    expect(findAdminBundledPluginsDir(adminRoot)).toBeNull();
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

// Two path expressions in two packages that nothing in the type system ties
// together; if they drift, plugins admin baked in fetch a catalog nobody
// staged.
test("the admin plugin-catalog glob and findAdminBundledPluginsDir name the same directory", async () => {
  const adminRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../admin",
  );
  const globsFile = resolve(adminRoot, "src/lib/catalog-globs.ts");
  const glob =
    /PLUGIN_CATALOGS\s*=\s*import\.meta\.glob<[^>]*>\(\s*"([^"]+)"/.exec(
      await readFile(globsFile, "utf8"),
    )?.[1];
  if (glob === undefined) {
    throw new Error(`no PLUGIN_CATALOGS glob literal in ${globsFile}`);
  }

  // The glob's fixed prefix — everything above its first wildcard — is the
  // directory it scans, resolved from the file that declares it.
  const scanned = resolve(
    dirname(globsFile),
    glob.slice(0, glob.indexOf("*")).replace(/\/$/, ""),
  );

  expect(findAdminBundledPluginsDir(adminRoot)).toBe(scanned);
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

  function stage(declared: readonly string[]): Promise<void> {
    const plugin = definePlugin("vendor", () => undefined, {
      i18n: {
        sourceLocale: "en",
        locales: declared,
        catalogPath: "./locales",
      },
    });
    const manifest = buildManifest(createPluginRegistry(), {
      plugins: [plugin],
      i18n: SITE_I18N,
    });
    return stagePluginCatalogs(dest, [plugin], manifest, projectRoot);
  }

  test("copies a declared, site-enabled locale into the staged admin dist", async () => {
    await installPlugin(["en", "uk", "de"]);
    await stage(["en", "uk", "de"]);

    const staged = join(dest, pluginCatalogStagedPath("vendor", "uk"));
    expect(await readFile(staged, "utf8")).toContain('"vendor.hello":"uk"');
  });

  test("skips the source locale and any locale the site has not enabled", async () => {
    await installPlugin(["en", "uk", "de"]);
    await stage(["en", "uk", "de"]);

    // `en` is the source locale; `de` is declared but disabled by the site,
    // so the intersection drops it.
    for (const locale of ["en", "de"]) {
      expect(
        existsSync(join(dest, pluginCatalogStagedPath("vendor", locale))),
      ).toBe(false);
    }
  });

  test("stages nothing when the slot declares only its source locale", async () => {
    // A slot naming only `en` projects an empty catalog map, so the copy loop
    // never runs.
    await installPlugin(["en", "uk", "de"]);
    await stage(["en"]);

    expect(existsSync(dest)).toBe(false);
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

/**
 * pnpm's `node_modules/@plumix/plugin-<id>` link, pointed wherever the
 * test needs it.
 */
async function linkPlugin(
  projectRoot: string,
  pluginId: string,
  target: string,
): Promise<void> {
  const scopeDir = join(projectRoot, "node_modules/@plumix");
  await mkdir(scopeDir, { recursive: true });
  await symlink(target, join(scopeDir, `plugin-${pluginId}`), "dir");
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
    const vendor = definePlugin("vendor", () => undefined, {
      i18n: {
        sourceLocale: "en",
        locales: ["en", "de", "uk"],
        catalogPath: "./locales",
      },
    });
    const bare = definePlugin("bare", () => undefined);

    const files = await collectPluginCatalogFiles([vendor, bare], projectRoot);

    const locales = join(
      projectRoot,
      "node_modules/@plumix/plugin-vendor/locales",
    );
    expect(Object.fromEntries(files)).toEqual({
      en: [{ path: join(locales, "en.mjs"), source: true }],
      de: [{ path: join(locales, "de.mjs"), source: false }],
    });
  });
});

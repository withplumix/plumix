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

// Integration coverage against real Node module resolution. The seam-
// based tests above don't exercise the `exports` enforcement
// (`ERR_PACKAGE_PATH_NOT_EXPORTED`) that Node applies in production —
// if a plugin's `package.json` doesn't expose `./package.json` in its
// `exports` map, `require.resolve("<name>/package.json")` throws and
// the unit tests miss the regression. These fixtures drive the
// production `createRequire` path against a tmpdir layout.
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
    // The plumix monorepo's `packages/plugins`, as `findAdminBundledPluginsDir`
    // hands it to the predicate: present, so a case that expects `false` has to
    // earn it on the comparison rather than on a missing directory.
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
    // Regression pin: under pnpm EVERY `node_modules` entry is a symlink,
    // including registry tarballs, which resolve into `.pnpm/`. Treating
    // symlink-ness alone as "workspace" silently dropped the plugin's catalog
    // URLs on every pnpm consumer site.
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
    // What a consumer site looks like: `findAdminBundledPluginsDir` found no
    // sibling of the installed admin, so no plugin can be bundled — not even
    // one whose link happens to land in a `packages/plugins` of the site's own.
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

// `findAdminBundledPluginsDir` mirrors a glob written in another package: admin
// bakes plugin catalogs in with `import.meta.glob` over a path relative to
// `packages/admin/src/lib`, and this one derives the same directory from the
// installed admin package root. Two path expressions, two packages, nothing in
// the type system holding them together — move `catalog-globs.ts` a directory,
// or widen the glob, and the predicate silently stops matching it. The drift is
// quiet in the direction that matters: plugins admin *did* bake in would be told
// to fetch a catalog nobody staged.
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

// The copy itself, driven the way a consumer's `plumix build` drives it: a plugin
// whose catalogs admin does not bake in, so its compiled `.mjs` has to reach the
// staged admin dist for the runtime `import(url)` to find it. Every other test in
// this file stops at resolution — whether a path resolves, whose `plugins/` dir it
// lands in — and never copies anything. That left the manifest-driven half of the
// pipeline uncovered, which is how a slot declaring only its source locale shipped
// four releases with unreachable translations.
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

    // `en` is the source locale — admin already has those strings as
    // `descriptor.message`. `de` ships a catalog and is declared, but the site
    // left it disabled, so the intersection drops it before staging.
    for (const locale of ["en", "de"]) {
      expect(
        existsSync(join(dest, pluginCatalogStagedPath("vendor", locale))),
      ).toBe(false);
    }
  });

  test("stages nothing when the slot declares only its source locale", async () => {
    // The bug this guards: catalogs present on disk, but a slot naming only `en`
    // projects an empty catalog map, so the plugin never reaches `pluginI18n` and
    // the copy loop never runs.
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

// Minimal createRequire stub for resolution tests. Maps known package
// specifiers to their resolved absolute paths; unknown specifiers
// throw the same MODULE_NOT_FOUND shape Node's resolver emits, which
// the resolver branches on.
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

// pnpm's `node_modules/@plumix/plugin-<id>` link, pointed wherever the
// test needs it.
async function linkPlugin(
  projectRoot: string,
  pluginId: string,
  target: string,
): Promise<void> {
  const scopeDir = join(projectRoot, "node_modules/@plumix");
  await mkdir(scopeDir, { recursive: true });
  await symlink(target, join(scopeDir, `plugin-${pluginId}`), "dir");
}

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

import {
  findAdminBundledPluginsDir,
  findPluginPackageRoot,
  isAdminBundledPlugin,
} from "./plugin-catalog-resolve.js";

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

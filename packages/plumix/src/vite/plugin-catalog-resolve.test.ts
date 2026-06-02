import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { findPluginPackageRoot } from "./plugin-catalog-resolve.js";

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
describe("findPluginPackageRoot — real FS", () => {
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

import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, onTestFinished, test, vi } from "vitest";

import { definePlugin, defineTheme } from "@plumix/core";

import { computeManifestAndRegistry } from "./manifest.js";

const theme = defineTheme({ templates: () => null });

const OPTIONS = {
  projectRoot: "/nowhere",
  bundledPluginsDir: null,
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

  test("a workspace-bundled plugin builds without a console line", async () => {
    // The monorepo's own layout, expected on every site build there, so it is
    // not worth a line.
    const projectRoot = await realpath(
      await mkdtemp(join(tmpdir(), "plumix-manifest-")),
    );
    onTestFinished(() => rm(projectRoot, { recursive: true, force: true }));
    const bundledPluginsDir = join(projectRoot, "packages/plugins");
    const pluginDir = join(bundledPluginsDir, "bundled");
    await mkdir(pluginDir, { recursive: true });
    await mkdir(join(projectRoot, "node_modules/@plumix"), { recursive: true });
    await symlink(
      pluginDir,
      join(projectRoot, "node_modules/@plumix/plugin-bundled"),
      "dir",
    );
    const bundled = definePlugin("bundled", {
      i18n: { sourceLocale: "en", locales: ["en"], catalogPath: "./locales" },
      setup: () => undefined,
    });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    onTestFinished(() => info.mockRestore());

    await computeManifestAndRegistry([bundled], {
      ...OPTIONS,
      projectRoot,
      bundledPluginsDir,
    });

    expect(info).not.toHaveBeenCalled();
  });
});

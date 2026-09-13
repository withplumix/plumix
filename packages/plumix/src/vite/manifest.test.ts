import { describe, expect, test } from "vitest";

import { definePlugin, defineTheme } from "@plumix/core";

import { computeManifestAndRegistry } from "./manifest.js";

const theme = defineTheme({ templates: () => null });

const OPTIONS = {
  projectRoot: "/nowhere",
  bundledPluginsDir: null,
  theme,
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

// A plugin whose registration is derived from the registry rather than known to
// it — the shape `@plumix/plugin-seo` uses to put its box on every public entry
// type, and the shape that only works once every plugin has registered.
const derived = definePlugin("derived", {
  setup: () => undefined,
  afterSetup: (ctx) => {
    const types = [...ctx.plugins.entryTypes.keys()];
    ctx.registerEntryMetaBox("derived", metaBox("derived", types));
  },
});

// Registered after the consumer above, so `setup` order alone cannot see it.
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
});

import { describe, expect, test } from "vitest";

import { definePlugin, defineTheme } from "@plumix/core";

import { computeManifestAndRegistry } from "./manifest.js";

const theme = defineTheme({ templates: () => null });

const OPTIONS = {
  projectRoot: "/nowhere",
  bundledPluginsDir: null,
  theme,
} as const;

// A plugin whose registration is derived from the registry rather than known to
// it — the shape `@plumix/plugin-seo` uses to put its box on every public entry
// type, and the shape that only works once every plugin has registered.
const derived = definePlugin("derived", (ctx) => {
  ctx.addAction("theme:ready", () => {
    const types = [...ctx.plugins.entryTypes.values()].map((type) => type.name);
    ctx.registerEntryMetaBox("derived", {
      label: "Derived",
      entryTypes: types,
      fields: [
        {
          key: "derived_field",
          type: "string",
          inputType: "text",
          label: "Field",
        },
      ],
    });
  });
});

// Registered after the consumer above, so `setup` order alone cannot see it.
const content = definePlugin("content", (ctx) => {
  ctx.registerEntryType("post", { label: "Posts", isPublic: true });
});

describe("computeManifestAndRegistry", () => {
  test("a box registered on theme:ready reaches the built manifest", async () => {
    // Regression: the admin manifest is built here, not at boot, so a
    // registration deferred to the theme handover was shipped as an empty list
    // while the running worker had it.
    const { manifest } = await computeManifestAndRegistry(
      [derived, content],
      OPTIONS,
    );

    const box = (manifest.entryMetaBoxes ?? []).find(
      (entry) => entry.id === "derived",
    );
    expect(box?.entryTypes).toEqual(["post"]);
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

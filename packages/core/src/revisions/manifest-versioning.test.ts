import { describe, expect, test } from "vitest";

import { HookRegistry } from "../hooks/registry.js";
import { definePlugin } from "../plugin/define.js";
import { buildManifest } from "../plugin/manifest.js";
import { installPlugins } from "../plugin/register.js";

function install(plugins: Parameters<typeof installPlugins>[0]["plugins"]) {
  return installPlugins({ hooks: new HookRegistry(), plugins });
}

describe("manifest versioning derivation", () => {
  test("types that opt into supports: ['revisions'] get a default versioning block", async () => {
    const plugin = definePlugin("vers", (ctx) => {
      ctx.registerEntryType("article", {
        label: "Articles",
        supports: ["revisions"],
      });
    });
    const { registry } = await install([plugin]);
    const article = registry.entryTypes.get("article");
    expect(article).toBeDefined();
    // Manifest emit pulls in versioning defaults.
    const manifest = buildManifest(registry);
    const entry = manifest.entryTypes.find((e) => e.name === "article");
    expect(entry?.versioning).toEqual({
      maxRevisions: 25,
      autosaveIntervalSeconds: 60,
    });
  });

  test("declared versioning overrides defaults per axis", async () => {
    const plugin = definePlugin("vers", (ctx) => {
      ctx.registerEntryType("article", {
        label: "Articles",
        supports: ["revisions"],
        versioning: { maxRevisions: 5, autosaveIntervalSeconds: 30 },
      });
    });
    const { registry } = await install([plugin]);
    const manifest = buildManifest(registry);
    const entry = manifest.entryTypes.find((e) => e.name === "article");
    expect(entry?.versioning).toEqual({
      maxRevisions: 5,
      autosaveIntervalSeconds: 30,
    });
  });

  test("types without supports: ['revisions'] have undefined versioning", async () => {
    const plugin = definePlugin("plain", (ctx) => {
      ctx.registerEntryType("note", { label: "Notes" });
    });
    const { registry } = await install([plugin]);
    const manifest = buildManifest(registry);
    const entry = manifest.entryTypes.find((e) => e.name === "note");
    expect(entry?.versioning).toBeUndefined();
  });
});

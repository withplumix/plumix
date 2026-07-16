import { describe, expect, it } from "vitest";

import { reconcile } from "./reconcile.js";

describe("reconcile", () => {
  it("resolves a fully-flagged invocation with no prompts", () => {
    const r = reconcile([
      "my-app",
      "--runtime",
      "cloudflare",
      "-p",
      "blog,media",
      "-y",
    ]);
    expect(r).toEqual({
      targetDir: "my-app",
      runtimeId: "cloudflare",
      pluginIds: ["blog", "media"],
      yes: true,
      prompts: [],
    });
  });

  it("defaults the runtime and empty plugins, flagging both as prompts", () => {
    const r = reconcile(["my-app"]);
    expect(r.runtimeId).toBe("cloudflare");
    expect(r.pluginIds).toEqual([]);
    expect(r.yes).toBe(false);
    expect(r.prompts).toEqual(["runtime", "plugins"]);
  });

  it("suppresses all prompts under --yes, defaulting to a blank app", () => {
    const r = reconcile(["my-app", "-y"]);
    expect(r.pluginIds).toEqual([]);
    expect(r.yes).toBe(true);
    expect(r.prompts).toEqual([]);
  });

  it("reports a missing target directory as a prompt", () => {
    const r = reconcile([]);
    expect(r.targetDir).toBeUndefined();
    expect(r.prompts).toContain("targetDir");
  });

  it("parses comma-separated plugins, trimming blanks", () => {
    expect(reconcile(["app", "-p", "blog, media ,,pages"]).pluginIds).toEqual([
      "blog",
      "media",
      "pages",
    ]);
  });

  it("accepts --runtime=<id> and --plugins=<csv> forms", () => {
    const r = reconcile(["app", "--runtime=cloudflare", "--plugins=blog"]);
    expect(r.runtimeId).toBe("cloudflare");
    expect(r.pluginIds).toEqual(["blog"]);
    expect(r.prompts).not.toContain("runtime");
    expect(r.prompts).not.toContain("plugins");
  });
});

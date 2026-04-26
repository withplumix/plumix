import type { UserConfig } from "vite";
import { describe, expect, test } from "vitest";

import { SHARED_RUNTIME_SPECIFIERS } from "@plumix/core";

import { plumixPluginAuthor } from "./plugin-author.js";

function callConfigHook(): UserConfig {
  const plugin = plumixPluginAuthor();
  const hook = plugin.config;
  if (typeof hook !== "function") {
    throw new Error("plugin.config must be a function");
  }
  return (hook as unknown as () => UserConfig)();
}

describe("plumixPluginAuthor", () => {
  test("marks every shared-runtime specifier external", () => {
    const config = callConfigHook();
    const external = config.build?.rollupOptions?.external;
    expect(Array.isArray(external)).toBe(true);
    const list = external as readonly string[];
    for (const specifier of SHARED_RUNTIME_SPECIFIERS) {
      expect(list).toContain(specifier);
    }
  });

  test("doesn't mark anything else external", () => {
    const config = callConfigHook();
    const external = config.build?.rollupOptions?.external as readonly string[];
    expect([...external].sort()).toEqual([...SHARED_RUNTIME_SPECIFIERS].sort());
  });

  test("runs in the `pre` phase so its externals win over later plugins", () => {
    const plugin = plumixPluginAuthor();
    expect(plugin.enforce).toBe("pre");
  });
});

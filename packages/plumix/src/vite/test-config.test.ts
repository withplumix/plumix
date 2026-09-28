import type {
  TestProjectInlineConfiguration,
  ViteUserConfig,
} from "vitest/config";
import { describe, expect, test } from "vitest";

import { baseConfig } from "@plumix/vitest-config/base";

import { defineTestConfig } from "./test-config.js";

// What a tier is, as far as a test run can tell: the fields a plugin's config
// and this repo's must agree on for "the same two tiers" to mean anything.
function tiers(config: ViteUserConfig) {
  const projects = (config.test?.projects ??
    []) as readonly TestProjectInlineConfiguration[];
  return projects.map((project) => ({
    extends: project.extends,
    define: project.define,
    optimizeDeps: project.optimizeDeps,
    name: project.test?.name,
    include: project.test?.include,
    exclude: project.test?.exclude,
    browser: project.test?.browser && {
      enabled: project.test.browser.enabled,
      headless: project.test.browser.headless,
      provider: project.test.browser.provider?.name,
      instances: project.test.browser.instances,
      viewport: project.test.browser.viewport,
      screenshotFailures: project.test.browser.screenshotFailures,
    },
  }));
}

describe("defineTestConfig", () => {
  test("sets up the same two tiers this repo's own suites run in", async () => {
    const config = await defineTestConfig()();

    expect(tiers(config).map((tier) => tier.name)).toEqual(["node", "browser"]);
    expect(tiers(config)).toEqual(tiers(baseConfig));
  });

  test("merges overrides over the tiers without replacing them", async () => {
    const config = await defineTestConfig({
      test: { setupFiles: ["./test/setup.ts"], exclude: ["fixtures/**"] },
    })();

    expect(config.test?.setupFiles).toEqual(["./test/setup.ts"]);
    expect(config.test?.exclude).toEqual(["fixtures/**"]);
    expect(tiers(config)).toEqual(tiers(baseConfig));
  });
});

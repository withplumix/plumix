import { describe, expect, test } from "vitest";
import { configDefaults } from "vitest/config";

import { baseConfig } from "@plumix/vitest-config/base";
import { NODE_TIER } from "@plumix/vitest-config/tiers";

import { defineTestConfig } from "./test-config.js";

describe("defineTestConfig", () => {
  test("sets up one Node config with this repo's test globs", async () => {
    const config = await defineTestConfig()();

    expect(config.test?.projects).toBeUndefined();
    expect(config.test?.browser).toBeUndefined();
    expect(config.test?.include).toEqual([...NODE_TIER.include]);
    expect(config.test?.exclude).toEqual([
      ...configDefaults.exclude,
      ...NODE_TIER.exclude,
    ]);
    expect(config.test?.include).toEqual(baseConfig.test?.include);
    expect(config.test?.exclude).toEqual(baseConfig.test?.exclude);
  });

  test("merges overrides over the Node config", async () => {
    const config = await defineTestConfig({
      test: { setupFiles: ["./test/setup.ts"], exclude: ["fixtures/**"] },
    })();

    expect(config.test?.setupFiles).toEqual(["./test/setup.ts"]);
    expect(config.test?.include).toEqual([...NODE_TIER.include]);
    expect(config.test?.exclude).toEqual([
      ...configDefaults.exclude,
      ...NODE_TIER.exclude,
      "fixtures/**",
    ]);
  });
});

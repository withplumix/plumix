import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";

import { baseConfig } from "@plumix/vitest-config/base";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./test/setup.ts"],
      // Scaffolding has no tests yet; infra is wired so the first real
      // feature component can add one without setup friction.
      passWithNoTests: true,
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  }),
);

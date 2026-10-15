import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";

import { baseConfig } from "@plumix/vitest-config/base";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      // Scaffolding has no tests yet; infra is wired so the first real
      // feature component can add one without setup friction.
      passWithNoTests: true,
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
        // Vitest doesn't run the Lingui Babel preset, so the real macro
        // throws at load; this stub hands the descriptor back unchanged.
        "@lingui/core/macro": fileURLToPath(
          new URL("./test/lingui-macro-stub.ts", import.meta.url),
        ),
      },
    },
  }),
);

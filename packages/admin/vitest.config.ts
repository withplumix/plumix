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
        // Production builds transform `defineMessage(...)` calls via
        // `@lingui/vite-plugin` + `@rolldown/plugin-babel` (see
        // `vite.config.ts`). Vitest's vite-node transform doesn't run
        // that preset on `.ts` imports, so the real macro entrypoint
        // throws at load. Alias to a runtime passthrough that mirrors
        // what Babel produces — `test/lingui-macro-stub.ts`.
        "@lingui/core/macro": fileURLToPath(
          new URL("./test/lingui-macro-stub.ts", import.meta.url),
        ),
      },
    },
  }),
);

import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";

import { baseConfig } from "@plumix/vitest-config/base";

export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: {
      alias: {
        // Vitest doesn't run the Lingui Babel macro, so the real entrypoint
        // throws at load. The stub hands back the descriptor as Babel would.
        "@lingui/core/macro": fileURLToPath(
          new URL("./test/lingui-macro-stub.ts", import.meta.url),
        ),
      },
    },
  }),
);

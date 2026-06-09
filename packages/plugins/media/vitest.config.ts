import { defineConfig, mergeConfig } from "vitest/config";

import { baseConfig } from "@plumix/vitest-config/base";

// jsdom is needed for the embed facade's interaction suite
// (`blocks/embed/EmbedFacade.test.tsx`). The server-side suites are
// environment-agnostic and work fine under jsdom too, so we set one
// environment for the whole package rather than branching per file.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./test/setup.ts"],
    },
  }),
);

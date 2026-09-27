import { defineConfig } from "vitest/config";

import { plumixSourceResolver } from "@plumix/vitest-config/source-resolver";

// The `test:build` tier only: the suite reads every covered package's built
// `.d.ts`, so it has nothing to run before the build graph has.
export default defineConfig({
  plugins: [plumixSourceResolver()],
  test: { include: ["test/**/*.build.test.ts"] },
});

import { defineConfig } from "vitest/config";

import { plumixSourceResolver } from "@plumix/vitest-config/source-resolver";

// The `test:build` tier: suites that run the built `plumix` CLI against a
// consumer project on disk, so they need `^build`. The default `test:unit`
// config excludes them.
export default defineConfig({
  plugins: [plumixSourceResolver()],
  test: {
    include: ["src/**/*.build.test.{ts,tsx}"],
    // `plumix migrate generate` spawns drizzle-kit; cold, that is seconds.
    testTimeout: 60_000,
  },
});

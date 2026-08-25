import { defineConfig } from "vitest/config";

import { plumixSourceResolver } from "@plumix/vitest-config/source-resolver";

// The `test:build` tier: the suites that bundle this package's source through a
// real Vite build and assert on what the bundle does. The default `test:unit`
// config excludes them.
export default defineConfig({
  plugins: [plumixSourceResolver()],
  test: {
    include: ["src/**/*.build.test.{ts,tsx}"],
    // Each case runs a Vite build — milliseconds warm, but a cold CI runner
    // pays for the module graph on the first one.
    testTimeout: 60_000,
  },
});

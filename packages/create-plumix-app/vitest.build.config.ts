import { defineConfig } from "vitest/config";

// The `test:build` tier: suites that spawn the built `dist/index.js` bin, so
// they need `build`. The default `test:unit` config excludes them.
export default defineConfig({
  test: {
    include: ["src/**/*.build.test.ts"],
    // Each case scaffolds a full project from the live workspace.
    testTimeout: 30_000,
  },
});

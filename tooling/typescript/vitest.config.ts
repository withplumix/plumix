import { defineConfig } from "vitest/config";

// Standalone rather than extending @plumix/vitest-config: that package
// depends on this one, so consuming it here would close a dependency cycle.
export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
});

import { defineConfig } from "vitest/config";

// Not `@plumix/vitest-config`: that package depends on this one, and the
// guard under test is a plain module with no workspace imports to resolve.
export default defineConfig({
  test: {
    include: ["*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["check-declarations.mjs"],
      reporter: ["text", "html"],
    },
  },
});

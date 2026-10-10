import { defineConfig } from "vitest/config";

// The sample check reads `plumix`'s published `.d.ts`, so it needs the build
// graph this tier's turbo task pulls.
export default defineConfig({
  test: {
    include: ["src/**/*.build.test.{ts,tsx}"],
  },
});

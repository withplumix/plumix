import { defineConfig } from "vitest/config";

// The `test:build` tier: runs only `*.build.test.ts`. The sample check
// type-checks against `plumix`'s published `.d.ts` files — the surface a reader
// actually consumes — so it needs the build graph this tier's turbo task pulls.
// The default `test:unit` config excludes these.
export default defineConfig({
  test: {
    include: ["src/**/*.build.test.{ts,tsx}"],
  },
});

import { defineConfig } from "vitest/config";

// The `test:build` tier: runs only `*.build.test.ts`. The sample check
// type-checks against `plumix`'s published `.d.ts` files — the surface a reader
// actually consumes — so it needs the build graph this tier's turbo task pulls.
// The default `test:unit` config excludes these.
export default defineConfig({
  test: {
    include: ["src/**/*.build.test.{ts,tsx}"],
    // The first test to reach the sample check pays for the TypeScript program
    // built over `plumix`'s published types — ~1.5s on a warm laptop, and the
    // 5s default leaves too little headroom for a cold CI box, where it has
    // timed out. 15s matches `packages/admin-editor` and absorbs the variance
    // without masking a genuine hang.
    testTimeout: 15_000,
  },
});

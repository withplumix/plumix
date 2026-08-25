import { defineConfig } from "vitest/config";

// The `test:build` tier: runs only `*.build.test.ts`. The sample check
// type-checks against `plumix`'s published `.d.ts` files — the surface a reader
// actually consumes — so it needs the build graph this tier's turbo task pulls.
// The default `test:unit` config excludes these.
export default defineConfig({
  test: {
    include: ["src/**/*.build.test.{ts,tsx}"],
    // The first test to reach the sample check pays for one TypeScript program
    // built over `plumix`'s published types, and every fenced sample in the
    // tree compiles into it. That cost scales with the content: 15s was set
    // when the estate held a handful of samples, and the 30 P0 pages took it to
    // 176, which timed out on CI while passing in about 7s on a warm laptop.
    // 60s holds the same ratio of headroom to observed cost. Raise it again
    // when the tree grows, rather than trimming samples to fit.
    testTimeout: 60_000,
  },
});

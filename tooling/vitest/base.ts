import { configDefaults, defineConfig } from "vitest/config";

// By name: a relative `.ts` specifier would need `allowImportingTsExtensions`
// in every consumer's tsconfig.
import { plumixSourceResolver } from "@plumix/vitest-config/source-resolver";
import { NODE_TIER } from "@plumix/vitest-config/tiers";

/**
 * `plumix/vite`'s `defineTestConfig` keeps its own copy of `./tiers.ts`, since
 * this package sits below `plumix`; a test in `plumix` holds them equal.
 */
export const baseConfig = defineConfig({
  plugins: [plumixSourceResolver()],
  test: {
    include: [...NODE_TIER.include],
    exclude: [...configDefaults.exclude, ...NODE_TIER.exclude],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}"],
      reporter: ["text", "html"],
    },
  },
});

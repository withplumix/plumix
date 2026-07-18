import { configDefaults, defineConfig } from "vitest/config";

// Imported by package name, not a relative `./source-resolver.ts` path: every
// package's vitest.config pulls this file in, and a `.ts` import specifier
// needs `allowImportingTsExtensions` in each consumer's tsconfig. The exports
// map hides the extension, so the plain subpath typechecks everywhere.
import { plumixSourceResolver } from "@plumix/vitest-config/source-resolver";

export const baseConfig = defineConfig({
  plugins: [plumixSourceResolver()],
  test: {
    include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
    // `*.build.test.ts` files need a real build; they're the `test:build` tier
    // (see packages/plumix), so keep them out of the default `test:unit` run.
    exclude: [...configDefaults.exclude, "**/*.build.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}"],
      reporter: ["text", "html"],
    },
  },
});

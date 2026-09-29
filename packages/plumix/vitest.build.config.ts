import { defineConfig } from "vitest/config";

import { plumixSourceResolver } from "@plumix/vitest-config/source-resolver";

// The `test:build` tier: runs only `*.build.test.ts` — the suites that inspect
// built artifacts (islands chunk size, the plugin Tailwind sidecar, the façade's
// published types). The default `test:unit` config excludes these; this
// one includes only them, and its turbo task pulls the build graph.
export default defineConfig({
  plugins: [plumixSourceResolver()],
  test: {
    include: ["src/**/*.build.test.{ts,tsx}"],
    // pnpm's bin shims export `NODE_PATH` into its hoisted store, and a CLI
    // started any other way — `bun --bun` on the `.mjs` entry — has none, so
    // nothing the build resolves may lean on it.
    env: { NODE_PATH: "" },
  },
});

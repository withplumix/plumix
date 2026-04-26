import type { KnipConfig } from "knip";

const config: KnipConfig = {
  // `exports` check disabled at the project level — admin's vendored
  // shadcn/ui primitives (sidebar, dropdown-menu, sheet, table, etc.)
  // expose 20+ components each, and we deliberately keep the full surface
  // so feature routes can pull from the palette as they grow. Re-enable
  // by splitting vendor UI into its own package, or tag-based filtering
  // via `@internal` JSDoc once that convention is in place.
  exclude: ["exports"],
  workspaces: {
    "tooling/typescript": {
      entry: ["*.json"],
    },
    // plumix.config.ts is the consumer's entry — knip can't infer it
    // from package.json's exports because examples don't publish.
    "examples/blog": {
      entry: ["plumix.config.ts"],
    },
    "examples/minimal": {
      entry: ["plumix.config.ts"],
    },
    // @plumix/core is a dependency but has no real imports yet (empty skeleton).
    // Remove these once packages have actual code importing from core.
    "packages/blocks": {
      ignoreDependencies: ["@plumix/core"],
    },
    // - drizzle-kit is invoked by consumers as a CLI hint, not imported.
    // - @plumix/admin is consumed via filesystem copy (scripts/copy-admin.mjs)
    //   at build time, not as a TypeScript import.
    "packages/plumix": {
      entry: [
        "src/index.ts",
        "src/plugin.ts",
        "src/admin/index.ts",
        // Each `plumix/admin/<lib>` shim is a leaf entry consumed by
        // plugin chunks at the consumer's build time via the alias
        // seam — knip can't see the runtime resolution.
        "src/admin/react.ts",
        "src/admin/react-jsx-runtime.ts",
        "src/admin/react-dom.ts",
        "src/admin/react-dom-client.ts",
        "src/admin/react-query.ts",
        "src/admin/react-router.ts",
        "src/blocks/index.ts",
        "src/cli/index.ts",
        "src/i18n/index.ts",
        "src/schema/index.ts",
        "src/test/index.ts",
        "src/test/playwright.ts",
        "src/theme/index.ts",
        "src/vite/index.ts",
        "bin/plumix.mjs",
      ],
      // - drizzle-kit is invoked by consumers as a CLI hint, not imported.
      // - @plumix/admin is consumed via filesystem copy (scripts/copy-admin.mjs).
      ignoreDependencies: ["drizzle-kit", "@plumix/admin"],
    },
    // The runtime-proof fixture plugin is loaded by playwright's
    // webServer command at e2e time — not via a static import knip
    // can follow. Same for the assembler script.
    "packages/admin": {
      entry: [
        "e2e/fixtures/build-runtime-proof-plugin.ts",
        "e2e/fixtures/runtime-proof-plugin/src/admin.ts",
      ],
    },
    // The `./commands` subpath export points at `dist/commands/index.js` —
    // knip's default entry discovery only reads `exports` paths and
    // doesn't map them back to source files, so the whole `src/commands`
    // tree plus its deps (`@cloudflare/vite-plugin`, `plumix`) read as
    // unused. Explicit entries pin the source location. `plumix` is a
    // workspace sibling used transitively via `emitPlumixSources`.
    "packages/runtimes/cloudflare": {
      entry: ["src/index.ts", "src/commands/index.ts"],
    },
  },
};

export default config;

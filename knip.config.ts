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
        "src/blocks/index.ts",
        "src/cli/index.ts",
        "src/i18n/index.ts",
        "src/schema/index.ts",
        "src/test/index.ts",
        "src/theme/index.ts",
        "src/vite/index.ts",
        "bin/plumix.mjs",
      ],
      ignoreDependencies: ["drizzle-kit", "@plumix/admin"],
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

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
    // Plugin playground — same shape as examples/*: `plumix.config.ts`
    // is the consumer entry, not visible to knip without an explicit
    // hint.
    "packages/plugins/media/playground": {
      entry: ["plumix.config.ts"],
    },
    "packages/plugins/menu/playground": {
      entry: ["plumix.config.ts"],
    },
    "packages/plugins/audit-log/playground": {
      entry: ["plumix.config.ts"],
    },
    "packages/plugins/blog/playground": {
      entry: ["plumix.config.ts"],
    },
    "packages/plugins/pages/playground": {
      entry: ["plumix.config.ts"],
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
        "src/admin/orpc-client.ts",
        "src/admin/orpc-client-fetch.ts",
        "src/admin/orpc-tanstack-query.ts",
        // `theme.css` is read at runtime by `compilePluginCss`
        // (admin-plugin-bundle.ts) via `readFile(ADMIN_THEME_CSS)` and
        // shipped to consumers via `scripts/copy-admin.mjs` — neither
        // path is a static import knip can follow.
        "src/admin/theme.css",
        "src/blocks/index.ts",
        "src/blocks/test.ts",
        "src/cli/index.ts",
        "src/fields/index.ts",
        "src/i18n/index.ts",
        "src/schema/index.ts",
        "src/test/index.ts",
        "src/test/playwright.ts",
        "src/theme/index.ts",
        "src/vite/index.ts",
      ],
      // - drizzle-kit is invoked by consumers as a CLI hint, not imported.
      // - @plumix/admin is consumed via filesystem copy (scripts/copy-admin.mjs).
      // - tailwindcss is resolved at runtime by `@tailwindcss/node`'s
      //   `compile()` (which `import`s `tailwindcss/theme` and
      //   `tailwindcss/utilities` from the synthesised CSS string), not
      //   from any TS source.
      ignoreDependencies: ["drizzle-kit", "@plumix/admin", "tailwindcss"],
    },
    // The runtime-proof fixture plugin is loaded by playwright's
    // webServer command at e2e time — not via a static import knip
    // can follow. Same for the assembler script.
    "packages/admin": {
      entry: [
        "e2e/fixtures/build-runtime-proof-plugin.ts",
        "e2e/fixtures/runtime-proof-plugin/src/admin.ts",
        // Reachable via `import "./MediaLibrary.js"` from admin.ts but
        // knip's static analysis on fixtures doesn't resolve the .js→
        // .tsx extension swap; list explicitly.
        "e2e/fixtures/runtime-proof-plugin/src/MediaLibrary.tsx",
        // With knip's playwright plugin disabled below, list the
        // playwright config + spec/support files explicitly so they
        // aren't flagged as unused.
        "playwright.config.ts",
        "e2e/*.spec.ts",
        "e2e/support/*.ts",
      ],
      // playwright.config.ts imports `@plumix/core/test/playwright` whose
      // dist may not exist on a fresh clone. Knip's playwright plugin
      // would import() the config (via jiti) and crash at resolve time.
      // Disabling it lets `pnpm knip` run cold without a prior build.
      // Pattern follows sanity-io/sdk's knip.config.ts.
      playwright: false,
    },
    // The admin chunk is loaded by the plumix vite plugin at consumer
    // build time via `adminEntry` — knip can't follow that runtime path.
    // Listing the entry pulls react / orpc / tanstack-query into the
    // referenced graph so they stop reading as unused devDependencies.
    // Listing MediaLibrary.tsx explicitly because knip's static analysis
    // doesn't resolve the `.js` → `.tsx` extension swap inside the chunk.
    // The e2e/* entries cover the playwright rig: build-chunk runs via
    // tsx from playwright's webServer (no static import), the spec runs
    // via the playwright CLI.
    "packages/plugins/media": {
      entry: [
        "src/admin/index.tsx",
        "src/admin/MediaLibrary.tsx",
        "e2e/globalSetup.ts",
        "e2e/*.spec.ts",
      ],
      // @plumix/runtime-cloudflare is consumed by the plugin's playground
      // (a sibling workspace), not by `src/`. Declared as a devDep so
      // turbo's `^build` pulls its dist into the cold-CI graph before
      // `test:e2e` runs.
      ignoreDependencies: ["@plumix/runtime-cloudflare"],
      // See packages/admin above for why the playwright plugin is off.
      playwright: false,
    },
    // Same shape as plugin-media: admin chunk loaded via `adminEntry`
    // at consumer build time; playwright rig invokes build-chunk via
    // tsx and the spec via the playwright CLI — none are static
    // imports knip can follow. The `./server` subpath is consumer-
    // facing (themes import server-only helpers from there); listed
    // so knip auto-discovery doesn't miss the subdir-index layout.
    "packages/plugins/menu": {
      entry: [
        "src/admin/index.tsx",
        "src/server/index.ts",
        "e2e/globalSetup.ts",
        "e2e/*.spec.ts",
      ],
      ignoreDependencies: ["@plumix/runtime-cloudflare"],
      playwright: false,
    },
    // Same shape as plugin-menu: admin chunk loaded via `adminEntry`
    // at consumer build time; `./server` subpath is consumer-facing
    // for themes that need server-only helpers.
    // blog is a declarative plugin (no admin chunk, no schema, no
    // RPC) — its package.json already declares the entry. The e2e
    // rig follows the same shape as the other plugin suites.
    "packages/plugins/blog": {
      entry: ["src/index.ts", "e2e/globalSetup.ts", "e2e/*.spec.ts"],
      ignoreDependencies: ["@plumix/runtime-cloudflare"],
      playwright: false,
    },
    // Same shape as plugin-blog: declarative plugin (no admin chunk,
    // no schema, no RPC). The e2e rig follows the same pattern as
    // the other plugin suites.
    "packages/plugins/pages": {
      entry: ["src/index.ts", "e2e/globalSetup.ts", "e2e/*.spec.ts"],
      ignoreDependencies: ["@plumix/runtime-cloudflare"],
      playwright: false,
    },
    "packages/plugins/audit-log": {
      entry: [
        "src/index.ts",
        "src/admin/index.tsx",
        "src/server/index.ts",
        "e2e/globalSetup.ts",
        "e2e/*.spec.ts",
      ],
      ignoreDependencies: ["@plumix/runtime-cloudflare"],
      // See packages/admin above for why the playwright plugin is off.
      playwright: false,
    },
  },
};

export default config;

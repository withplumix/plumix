import type { Messages } from "@lingui/core";

// Vite expands these globs at build time into `path → () => import(path)` maps
// of the compiled catalogs on disk. Extracted from `i18n-boot` so tests can
// `vi.mock` the catalog set: `import.meta.glob` is a filesystem scan the vitest
// source-resolver can't stub, and a test shouldn't depend on which locales
// `i18n:compile` happened to produce.

// Admin's own compiled catalogs. Adding a locale (drop a `.po`, run
// `pnpm i18n:compile`) appears here automatically.
export const ADMIN_CATALOGS = import.meta.glob<{ messages: Messages }>(
  "../../locales/*.mjs",
);

// First-party workspace plugins ship catalogs via static glob — admin reads
// them at zero runtime cost. Third-party plugins load via manifest URLs.
export const PLUGIN_CATALOGS = import.meta.glob<{ messages: Messages }>(
  "../../../plugins/*/locales/*.mjs",
);

// The editor package ships its own chrome catalog, bundled into admin like a
// workspace plugin, so merge it the same zero-runtime-cost way.
export const EDITOR_CATALOGS = import.meta.glob<{ messages: Messages }>(
  "../../../admin-editor/locales/*.mjs",
);

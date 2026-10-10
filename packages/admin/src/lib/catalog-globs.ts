import type { Messages } from "@lingui/core";

// Kept apart from `i18n-boot` so a caller needn't inherit whichever locales
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

// Core's blocks catalog: core-block metadata the inserter and inspector show,
// and the render strings the editor canvas resolves from the merged catalog
// the host pushes to it.
export const BLOCKS_CATALOGS = import.meta.glob<{ messages: Messages }>(
  "../../../core/locales/blocks-*.mjs",
);

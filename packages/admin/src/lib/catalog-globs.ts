import type { Messages } from "@lingui/core";

// Kept apart from `i18n-boot` so a caller needn't inherit whichever locales
// `i18n:compile` happened to produce.

/**
 * Admin's own compiled catalogs. Adding a locale (drop a `.po`, run
 * `pnpm i18n:compile`) appears here automatically.
 */
export const ADMIN_CATALOGS = import.meta.glob<{ messages: Messages }>(
  "../../locales/*.mjs",
);

/** The editor package's chrome catalog: a real dependency of admin, so its
 *  build is ordered before admin's. */
export const EDITOR_CATALOGS = import.meta.glob<{ messages: Messages }>(
  "../../../admin-editor/locales/*.mjs",
);

/**
 * Core's blocks catalog: core-block metadata the inserter and inspector show,
 * and the render strings the editor canvas resolves from the merged catalog
 * the host pushes to it.
 */
export const BLOCKS_CATALOGS = import.meta.glob<{ messages: Messages }>(
  "../../../core/locales/blocks-*.mjs",
);

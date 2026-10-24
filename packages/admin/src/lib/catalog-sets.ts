import type { AdminCatalogSet } from "@plumix/core/manifest";

/**
 * Each set's catalog path up to the locale, from this folder, as the globs in
 * `catalog-globs.ts` key it. The boot and the build both read it.
 */
export const CATALOG_SET_PREFIXES = {
  admin: "../../locales/",
  editor: "../../../admin-editor/locales/",
  blocks: "../../../core/locales/blocks-",
} as const satisfies Record<AdminCatalogSet, string>;

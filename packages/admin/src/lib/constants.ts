/** Vite's `base` appends a trailing slash; the router's `basepath` omits it. */
export const ADMIN_BASE_PATH = "/_plumix/admin" as const;

/**
 * The locale `descriptor.message` strings are authored in, and the fallback
 * for an uncompiled one. Mirrors `lingui.config.ts:sourceLocale`, which the
 * bundle can't import. Guarded by: packages/admin/src/lib/i18n-boot.test.ts
 */
export const SOURCE_LOCALE = "en";

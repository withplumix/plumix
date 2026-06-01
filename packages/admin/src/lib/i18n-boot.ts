import type { Messages } from "@lingui/core";
import { i18n } from "@lingui/core";

// Vite expands the glob at build time into a `path → () => import(path)`
// map covering every compiled catalog on disk. Adding a locale (drop a
// `.po`, run `pnpm i18n:compile`) appears here automatically — no
// constant to keep in sync, no allowlist to extend.
const CATALOGS = import.meta.glob<{ messages: Messages }>(
  "../../locales/*.mjs",
);

// Source locale: the language `descriptor.message` strings are authored
// in. When a user's locale isn't compiled (yet, or at all), we fall
// back here. Mirrors `lingui.config.ts:sourceLocale`.
const SOURCE_LOCALE = "en";

function catalogPath(locale: string): string {
  return `../../locales/${locale}.mjs`;
}

/** Load and activate the compiled catalog for the user's active locale.
 *  The admin shell rewrites `<html lang>` server-side (slice 4) to the
 *  user's `meta.locale`; we normalize (lowercase + region-strip) and
 *  look up the matching catalog loader. Unknown locales fall back to
 *  the source locale. A missing source catalog (e.g., a dev boot
 *  before `pnpm i18n:compile` has ever run) leaves Lingui in its
 *  descriptor-message fallback mode — never throws, never blanks. */
export async function bootI18n(): Promise<void> {
  const tag = document.documentElement.lang.toLowerCase().split("-")[0] ?? "";
  const requested = CATALOGS[catalogPath(tag)];
  const fallback = CATALOGS[catalogPath(SOURCE_LOCALE)];
  const loader = requested ?? fallback;
  if (!loader) return;
  const locale = requested ? tag : SOURCE_LOCALE;
  const { messages } = await loader();
  i18n.load(locale, messages);
  i18n.activate(locale);
}

// Admin-bar strings live in `locales/admin-bar-*.po` like every other
// plumix surface — `plumix i18n verify` gates the descriptor↔catalog
// drift and translators never have to find a second system. Catalogs
// compile to static modules (worker-safe, no fs) imported via the
// package's own `./locales/*` subpath; the SSR render does a direct
// per-request lookup, never a shared-singleton `activate()`. The
// `admin-bar-` prefix keeps this surface's catalog distinct from a
// later debug-bar catalog in the same flat locales/ dir.

import { messages as arMessages } from "@plumix/core/locales/admin-bar-ar";
import { messages as deMessages } from "@plumix/core/locales/admin-bar-de";
import { messages as enMessages } from "@plumix/core/locales/admin-bar-en";
import { messages as ukMessages } from "@plumix/core/locales/admin-bar-uk";
import { messages as zhCnMessages } from "@plumix/core/locales/admin-bar-zh-CN";

export type BarLocale = "en" | "de" | "uk" | "ar" | "zh-CN";

type CompiledCatalog = Record<string, string | readonly string[]>;

const CATALOGS: Readonly<Record<BarLocale, CompiledCatalog>> = {
  en: enMessages,
  de: deMessages,
  uk: ukMessages,
  ar: arMessages,
  "zh-CN": zhCnMessages,
};

// Source descriptors — `plumix i18n verify` matches these against the
// po catalogs; `message` is the English source and the runtime
// fallback for locales missing an entry.
const M = {
  siteFallback: { id: "core.adminBar.siteFallback", message: "Site" },
  newGroup: { id: "core.adminBar.newGroup", message: "+ New" },
  newGroupAria: { id: "core.adminBar.newGroupAria", message: "Create new" },
  edit: { id: "core.adminBar.edit", message: "Edit" },
  account: { id: "core.adminBar.account", message: "Account" },
  navAria: { id: "core.adminBar.navAria", message: "Admin" },
} as const;

export interface BarStrings {
  readonly siteFallback: string;
  readonly newGroup: string;
  readonly newGroupAria: string;
  readonly edit: string;
  readonly account: string;
  readonly navAria: string;
}

const KNOWN: ReadonlySet<string> = new Set(Object.keys(CATALOGS));

/**
 * Resolves the admin user's bar locale from `meta.locale` (per WP semantics —
 * `get_user_locale()`, not `get_locale()`). Falls back to English when the
 * user has no stored locale or stored a locale we don't ship strings for.
 *
 * Deliberately NOT the unified `resolveLocale` (`i18n/resolve-locale.ts`):
 * that resolver path-gates `meta.locale`/Accept-Language/cookie to
 * `/_plumix/*` so public HTML stays byte-identical per URL for the CDN
 * cache. The admin bar is the documented exception — it must localize
 * per authenticated user *on public routes*, and that's cache-safe
 * precisely because the bar only renders when a session cookie is
 * present, and session-bearing responses are private/uncacheable
 * anyway. Anonymous (cacheable) visitors get no bar and the default
 * locale. The locale cookie can't help here regardless: it's
 * `Path=/_plumix/`, so the browser never sends it on the front end.
 * Fold this into `resolveLocale` and per-user bar localization breaks.
 */
export function resolveBarLocale(user: {
  readonly meta: Record<string, unknown>;
}): BarLocale {
  const stored = user.meta.locale;
  if (typeof stored === "string" && KNOWN.has(stored)) {
    return stored as BarLocale;
  }
  return "en";
}

// Compiled lingui entries are token arrays (a lone string for plain
// messages); the bar has no ICU placeholders, so anything else falls
// back to the English source.
function resolveMessage(
  catalog: CompiledCatalog,
  descriptor: { readonly id: string; readonly message: string },
): string {
  const value = catalog[descriptor.id];
  const text = typeof value === "string" ? value : value?.[0];
  return typeof text === "string" && text.length > 0
    ? text
    : descriptor.message;
}

export function barMessages(locale: BarLocale): BarStrings {
  const catalog = CATALOGS[locale];
  return {
    siteFallback: resolveMessage(catalog, M.siteFallback),
    newGroup: resolveMessage(catalog, M.newGroup),
    newGroupAria: resolveMessage(catalog, M.newGroupAria),
    edit: resolveMessage(catalog, M.edit),
    account: resolveMessage(catalog, M.account),
    navAria: resolveMessage(catalog, M.navAria),
  };
}

export function barDirection(locale: BarLocale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

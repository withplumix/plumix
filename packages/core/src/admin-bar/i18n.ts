// Admin-bar strings live in `locales/*.po` like every other plumix
// surface — `plumix i18n verify` gates the descriptor↔catalog drift
// and translators never have to find a second system. Catalogs are
// compiled to static modules (worker-safe, no fs) and imported via
// the package's own `./locales/*` subpath; the SSR render does a
// direct per-request lookup, never a shared-singleton `activate()`.

import { messages as arMessages } from "@plumix/core/locales/ar";
import { messages as deMessages } from "@plumix/core/locales/de";
import { messages as enMessages } from "@plumix/core/locales/en";
import { messages as ukMessages } from "@plumix/core/locales/uk";
import { messages as zhCnMessages } from "@plumix/core/locales/zh-CN";

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

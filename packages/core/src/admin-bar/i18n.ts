// Catalogs compile to static modules (worker-safe, no fs), looked up per
// request rather than through a shared `activate()` singleton.

import { messages as arMessages } from "@plumix/core/locales/admin-bar-ar";
import { messages as deMessages } from "@plumix/core/locales/admin-bar-de";
import { messages as enMessages } from "@plumix/core/locales/admin-bar-en";
import { messages as ukMessages } from "@plumix/core/locales/admin-bar-uk";
import { messages as zhCnMessages } from "@plumix/core/locales/admin-bar-zh-CN";

import type { CompiledCatalog } from "../blocks/index.js";
import type { ResolvedMeta } from "../meta/contract/bags.js";
import { resolveMessage } from "../blocks/index.js";

export type BarLocale = "en" | "de" | "uk" | "ar" | "zh-CN";

const CATALOGS: Readonly<Record<BarLocale, CompiledCatalog>> = {
  en: enMessages,
  de: deMessages,
  uk: ukMessages,
  ar: arMessages,
  "zh-CN": zhCnMessages,
};

/**
 * Source descriptors — `plumix i18n verify` matches these against the
 * po catalogs; `message` is the English source and the runtime
 * fallback for locales missing an entry.
 */
const M = {
  siteFallback: { id: "core.adminBar.siteFallback", message: "Site" },
  newGroup: { id: "core.adminBar.newGroup", message: "+ New" },
  newGroupAria: { id: "core.adminBar.newGroupAria", message: "Create new" },
  edit: { id: "core.adminBar.edit", message: "Edit" },
  account: { id: "core.adminBar.account", message: "Account" },
  profile: { id: "core.adminBar.profile", message: "Profile" },
  signOut: { id: "core.adminBar.signOut", message: "Sign out" },
  navAria: { id: "core.adminBar.navAria", message: "Admin" },
} as const;

export interface BarStrings {
  readonly siteFallback: string;
  readonly newGroup: string;
  readonly newGroupAria: string;
  readonly edit: string;
  readonly account: string;
  readonly profile: string;
  readonly signOut: string;
  readonly navAria: string;
}

const KNOWN: ReadonlySet<string> = new Set(Object.keys(CATALOGS));

/**
 * Not `resolveLocale`, which ignores `meta.locale` on public routes for the
 * CDN. The bar only renders with a session, so its response is uncacheable
 * anyway.
 */
export function resolveBarLocale(user: {
  readonly meta: ResolvedMeta;
}): BarLocale {
  const stored = user.meta.locale;
  if (typeof stored === "string" && KNOWN.has(stored)) {
    return stored as BarLocale;
  }
  return "en";
}

export function barMessages(locale: BarLocale): BarStrings {
  const catalog = CATALOGS[locale];
  return {
    siteFallback: resolveMessage(catalog, M.siteFallback),
    newGroup: resolveMessage(catalog, M.newGroup),
    newGroupAria: resolveMessage(catalog, M.newGroupAria),
    edit: resolveMessage(catalog, M.edit),
    account: resolveMessage(catalog, M.account),
    profile: resolveMessage(catalog, M.profile),
    signOut: resolveMessage(catalog, M.signOut),
    navAria: resolveMessage(catalog, M.navAria),
  };
}

export function barDirection(locale: BarLocale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

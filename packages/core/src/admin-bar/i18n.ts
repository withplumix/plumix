// Catalogs compile to static modules (worker-safe, no fs), looked up per
// request rather than through a shared `activate()` singleton.

import { catalogs } from "@plumix/core/locales/index/admin-bar";

import type { ResolvedMeta } from "../meta/contract/bags.js";
import { resolveMessage } from "../blocks/index.js";
import { lazyCatalogs } from "../blocks/lazy-catalogs.js";

const CATALOGS = lazyCatalogs(catalogs);

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

const KNOWN: ReadonlySet<string> = new Set(CATALOGS.locales);

/**
 * Not `resolveLocale`, which ignores `meta.locale` on public routes for the
 * CDN. The bar only renders with a session, so its response is uncacheable
 * anyway.
 */
export function resolveBarLocale(user: {
  readonly meta: ResolvedMeta;
}): string {
  const stored = user.meta.locale;
  if (typeof stored === "string" && KNOWN.has(stored)) return stored;
  return "en";
}

/** Imports `locale`'s catalog for {@link barMessages} to read. */
export async function loadBarCatalog(locale: string): Promise<void> {
  await CATALOGS.load(locale);
}

/** Read mid-render, which cannot await, so `loadBarCatalog` runs first. */
export function barMessages(locale: string): BarStrings {
  const catalog = CATALOGS.loaded(locale);
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

export function barDirection(locale: string): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

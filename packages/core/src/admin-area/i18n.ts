// Looked up per call server-side, not via an `activate()` singleton: a runtime
// adapter names areas to visitors outside the admin, where no Lingui instance
// runs.

import { catalogs } from "@plumix/core/locales/index/admin-area";

import type { AdminArea } from "../context/runtime-adapter.js";
import { resolveMessage } from "../blocks/index.js";
import { lazyCatalogs } from "../blocks/lazy-catalogs.js";
import { catalogLocale } from "../i18n/catalog-locale.js";

const CATALOGS = lazyCatalogs(catalogs);

/**
 * Source descriptors — `plumix i18n verify` matches these against the po
 * catalogs; `message` is the English source and the runtime fallback.
 */
const M = {
  apiTokens: { id: "core.adminArea.apiTokens", message: "API tokens" },
  deviceAuthorization: {
    id: "core.adminArea.deviceAuthorization",
    message: "Device sign-in",
  },
  passkeys: { id: "core.adminArea.passkeys", message: "Passkeys" },
  oauthLinking: { id: "core.adminArea.oauthLinking", message: "OAuth sign-in" },
  emailDelivery: {
    id: "core.adminArea.emailDelivery",
    message: "Email delivery",
  },
} as const satisfies Record<AdminArea, { id: string; message: string }>;

/**
 * Real Accept-Language headers carry 1–4 entries; cap what a hostile client
 * can make us parse.
 */
const MAX_ACCEPT_LANGUAGE_ENTRIES = 16;

const SOURCE_LOCALE = "en";

/** Not a shipped locale, so `catalogLocale` returning it means no catalog serves the entry. */
const NO_CATALOG = "und";

function languageTag(entry: string): string | undefined {
  const tag = entry.split(";")[0]?.trim();
  if (!tag) return undefined;
  try {
    return new Intl.Locale(tag).baseName;
  } catch {
    return undefined;
  }
}

/**
 * The catalog locale of the first `acceptLanguage` entry a shipped catalog
 * serves, the source catalog included; English otherwise.
 */
function negotiateLocale(acceptLanguage: string | null): string {
  const shipped = CATALOGS.locales;
  for (const entry of (acceptLanguage ?? "").split(
    ",",
    MAX_ACCEPT_LANGUAGE_ENTRIES,
  )) {
    const tag = languageTag(entry);
    if (tag === undefined) continue;
    const locale = catalogLocale(tag, shipped, NO_CATALOG);
    if (locale !== NO_CATALOG) return locale;
  }
  return SOURCE_LOCALE;
}

/**
 * `areas` as one localized list, in the first locale of an `Accept-Language`
 * header that labels ship for, or English.
 */
export async function listAdminAreas(
  areas: readonly AdminArea[],
  acceptLanguage: string | null,
): Promise<string> {
  const locale = negotiateLocale(acceptLanguage);
  const catalog = await CATALOGS.load(locale);
  return new Intl.ListFormat(locale, { type: "conjunction" }).format(
    areas.map((area) => resolveMessage(catalog, M[area])),
  );
}

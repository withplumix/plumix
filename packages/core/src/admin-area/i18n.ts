// Looked up per call server-side, not via an `activate()` singleton: a runtime
// adapter names areas to visitors outside the admin, where no Lingui instance
// runs.

import { messages as arMessages } from "@plumix/core/locales/admin-area-ar";
import { messages as deMessages } from "@plumix/core/locales/admin-area-de";
import { messages as enMessages } from "@plumix/core/locales/admin-area-en";
import { messages as ukMessages } from "@plumix/core/locales/admin-area-uk";
import { messages as zhCnMessages } from "@plumix/core/locales/admin-area-zh-CN";

import type { CompiledCatalog } from "../blocks/index.js";
import type { AdminArea } from "../context/runtime-adapter.js";
import { resolveMessage } from "../blocks/index.js";

const CATALOGS: Readonly<Record<string, CompiledCatalog>> = {
  en: enMessages,
  de: deMessages,
  uk: ukMessages,
  ar: arMessages,
  "zh-CN": zhCnMessages,
};

// Source descriptors — `plumix i18n verify` matches these against the po
// catalogs; `message` is the English source and the runtime fallback.
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

// Real Accept-Language headers carry 1–4 entries; cap what a hostile client
// can make us parse.
const MAX_ACCEPT_LANGUAGE_ENTRIES = 16;

// The first locale in `acceptLanguage` a catalog ships for, matched by exact
// tag and then by language (`de-AT` → `de`, `zh` → `zh-CN`); English otherwise.
function matchLocale(acceptLanguage: string | null): string {
  const shipped = Object.keys(CATALOGS);
  for (const entry of (acceptLanguage ?? "").split(
    ",",
    MAX_ACCEPT_LANGUAGE_ENTRIES,
  )) {
    const tag = entry.split(";")[0]?.trim().toLowerCase();
    if (!tag) continue;
    const exact = shipped.find((code) => code.toLowerCase() === tag);
    if (exact) return exact;
    const language = tag.split("-")[0];
    const byLanguage = shipped.find((code) => code.split("-")[0] === language);
    if (byLanguage) return byLanguage;
  }
  return "en";
}

/**
 * `areas` as one localized list, in the first locale of an `Accept-Language`
 * header that labels ship for, or English.
 */
export function listAdminAreas(
  areas: readonly AdminArea[],
  acceptLanguage: string | null,
): string {
  const locale = matchLocale(acceptLanguage);
  const catalog = CATALOGS[locale] ?? enMessages;
  return new Intl.ListFormat(locale, { type: "conjunction" }).format(
    areas.map((area) => resolveMessage(catalog, M[area])),
  );
}

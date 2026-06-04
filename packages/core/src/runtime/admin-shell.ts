import type { AuthenticatedUser } from "../context/app.js";
import type { ResolvedI18n, ResolvedLocale } from "../i18n/locale-registry.js";
import { readSessionCookie } from "../auth/cookies.js";
import { ADMIN_LOCALE_COOKIE } from "../i18n/cookie.js";
import { findEnabledLocale } from "../i18n/locale-registry.js";

// Real Accept-Language headers carry 1–4 entries; cap defensively so a
// hostile client can't burn CPU on N×`Intl.Locale` allocations per GET.
const MAX_ACCEPT_LANGUAGE_ENTRIES = 16;

export function rewriteAdminShellLangDir(
  html: string,
  locale: ResolvedLocale,
): string {
  return html.replace(
    /<html\b[^>]*>/i,
    `<html lang="${locale.code}" dir="${locale.direction}">`,
  );
}

// `?lang=` query → `user.meta.locale` (WP `get_user_locale` parity) →
// `plumix_locale` cookie (WP `wp_lang` parity) → Accept-Language (emdash
// 3-tier matcher) → site default. `i18n.resolveLocale` override is
// intentionally NOT consulted here; admin uses this chain, the public-route
// resolver is the place to layer custom resolution.
export function resolveAdminShellLocale(args: {
  readonly request: Request;
  readonly user: AuthenticatedUser | null;
  readonly i18n: ResolvedI18n;
}): ResolvedLocale {
  const fromQuery = new URL(args.request.url).searchParams.get("lang");
  if (fromQuery) {
    const match = findEnabledLocale(args.i18n, fromQuery);
    if (match) return match;
  }
  if (typeof args.user?.meta.locale === "string") {
    const match = findEnabledLocale(args.i18n, args.user.meta.locale);
    if (match) return match;
  }
  const fromCookie = readSessionCookie(args.request, ADMIN_LOCALE_COOKIE);
  if (fromCookie) {
    const match = findEnabledLocale(args.i18n, fromCookie);
    if (match) return match;
  }
  const fromHeader = matchAcceptLanguage(args.request, args.i18n);
  if (fromHeader) return fromHeader;
  return args.i18n.defaultLocale;
}

// 3-tier matcher (emdash port): exact canonical → script-mapped
// (`zh-Hant` → `zh-TW`) → base-language-mapped (`pt-PT` → `pt-BR`). Browsers
// emit q-sorted entries, so first-match-wins over iteration order is enough.
function matchAcceptLanguage(
  request: Request,
  i18n: ResolvedI18n,
): ResolvedLocale | null {
  const header = request.headers.get("accept-language");
  if (!header) return null;
  const { scriptMap, baseMap } = buildFallbackMaps(i18n);
  const entries = header.split(",", MAX_ACCEPT_LANGUAGE_ENTRIES);
  for (const entry of entries) {
    const raw = entry.split(";")[0]?.trim();
    if (!raw) continue;
    const matched = matchTag(raw, i18n, scriptMap, baseMap);
    if (matched) return matched;
  }
  return null;
}

function matchTag(
  raw: string,
  i18n: ResolvedI18n,
  scriptMap: Map<string, ResolvedLocale>,
  baseMap: Map<string, ResolvedLocale>,
): ResolvedLocale | null {
  let locale: Intl.Locale;
  try {
    locale = new Intl.Locale(raw);
  } catch {
    return null;
  }
  const exact = findEnabledLocale(i18n, locale.baseName);
  if (exact) return exact;
  if (locale.script) {
    const scripted = scriptMap.get(
      `${locale.language}-${locale.script}`.toLowerCase(),
    );
    if (scripted) return scripted;
  }
  return baseMap.get(locale.language) ?? null;
}

function buildFallbackMaps(i18n: ResolvedI18n): {
  scriptMap: Map<string, ResolvedLocale>;
  baseMap: Map<string, ResolvedLocale>;
} {
  // Registry codes were canonicalized through `new Intl.Locale(...)` at boot
  // (`resolveLocales`), so `maximize()` here cannot throw on a valid entry.
  const scriptMap = new Map<string, ResolvedLocale>();
  const baseMap = new Map<string, ResolvedLocale>();
  for (const l of i18n.locales) {
    if (!l.enabled) continue;
    const max = new Intl.Locale(l.code).maximize();
    if (max.script) {
      const key = `${max.language}-${max.script}`.toLowerCase();
      if (!scriptMap.has(key)) scriptMap.set(key, l);
    }
    if (!baseMap.has(max.language)) baseMap.set(max.language, l);
  }
  return { scriptMap, baseMap };
}

import type { AuthenticatedUser } from "../context/app.js";
import type { ResolvedI18n, ResolvedLocale } from "../i18n/locale-registry.js";
import { readSessionCookie } from "../auth/cookies.js";
import { findEnabledLocale } from "../i18n/locale-registry.js";

// Scoped `Path=/_plumix/admin/` at write-time so it never reaches public
// routes — keeps public HTML identical across visitors for cache layers.
const ADMIN_LOCALE_COOKIE = "plumix-locale";

export function rewriteAdminShellLangDir(
  html: string,
  locale: ResolvedLocale,
): string {
  return html.replace(
    /<html\b[^>]*>/i,
    `<html lang="${locale.code}" dir="${locale.direction}">`,
  );
}

// Admin shell locale chain: explicit signals first, then Accept-Language as
// a first-time-visitor convenience (emdash parity). `?lang=` query is a
// one-shot override; `user.meta.locale` is WP `get_user_locale` parity for
// the authenticated path; `plumix-locale` cookie is WP `wp_lang` parity for
// anonymous visitors that have already picked. Accept-Language closes the
// "first-time visitor sees the site default" gap — uncached admin path, so
// the public-frontend cache invariant from slice 2 is unaffected.
//
// `i18n.resolveLocale` operator override is intentionally NOT consulted;
// admin uses this chain, the public-route resolver is the place to layer
// custom resolution.
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
  const scriptMap = buildScriptMap(i18n);
  const baseMap = buildBaseMap(i18n);
  for (const entry of header.split(",")) {
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
  let canonical: string;
  let locale: Intl.Locale;
  try {
    locale = new Intl.Locale(raw);
    canonical = locale.baseName;
  } catch {
    return null;
  }
  const exact = findEnabledLocale(i18n, canonical);
  if (exact) return exact;
  if (locale.script) {
    const key = `${locale.language}-${locale.script}`.toLowerCase();
    const scripted = scriptMap.get(key);
    if (scripted) return scripted;
  }
  const base = canonical.split("-")[0]?.toLowerCase();
  if (base) {
    const based = baseMap.get(base);
    if (based) return based;
  }
  return null;
}

function buildScriptMap(i18n: ResolvedI18n): Map<string, ResolvedLocale> {
  const map = new Map<string, ResolvedLocale>();
  for (const l of i18n.locales) {
    if (!l.enabled) continue;
    let max: Intl.Locale;
    try {
      max = new Intl.Locale(l.code).maximize();
    } catch {
      continue;
    }
    if (!max.script) continue;
    const key = `${max.language}-${max.script}`.toLowerCase();
    if (!map.has(key)) map.set(key, l);
  }
  return map;
}

function buildBaseMap(i18n: ResolvedI18n): Map<string, ResolvedLocale> {
  const map = new Map<string, ResolvedLocale>();
  for (const l of i18n.locales) {
    if (!l.enabled) continue;
    const base = l.code.split("-")[0]?.toLowerCase();
    if (base && !map.has(base)) map.set(base, l);
  }
  return map;
}

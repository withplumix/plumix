import type { ResolvedI18n, ResolvedLocale } from "./locale-registry.js";
import { findEnabledLocale } from "./locale-registry.js";

// Real Accept-Language headers carry 1–4 entries; cap defensively so a
// hostile client can't burn CPU on N×`Intl.Locale` allocations per GET.
const MAX_ACCEPT_LANGUAGE_ENTRIES = 16;

// 3-tier matcher: exact canonical → script-mapped (`zh-Hant` → `zh-TW`) →
// base-language-mapped (`pt-PT` → `pt-BR`). Browsers emit q-sorted entries,
// so first-match-wins over iteration order is enough.
export function matchAcceptLanguage(
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

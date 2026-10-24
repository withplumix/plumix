import { CLDR_PARENT_LOCALES } from "./cldr-parent-locales.js";

const CLDR_ROOT = "und";

function canonical(tag: string): string {
  return new Intl.Locale(tag).baseName;
}

function maximized(tag: string): Intl.Locale {
  return new Intl.Locale(tag).maximize();
}

function dropLastSubtag(tag: string): string | undefined {
  const cut = tag.lastIndexOf("-");
  return cut === -1 ? undefined : tag.slice(0, cut);
}

function parentOf(tag: string): string | undefined {
  const parent = CLDR_PARENT_LOCALES[tag] ?? dropLastSubtag(tag);
  return parent === CLDR_ROOT ? undefined : parent;
}

function* fallbackChain(locale: string): Generator<string> {
  for (
    let tag: string | undefined = canonical(locale);
    tag !== undefined;
    tag = parentOf(tag)
  ) {
    yield tag;
  }
}

/** `zh` is served by a `zh-CN` catalog, since CLDR's likely subtags make them the same locale. */
function shippedFor(
  tag: string,
  shipped: readonly string[],
): string | undefined {
  const exact = shipped.find((code) => canonical(code) === tag);
  if (exact !== undefined) return exact;
  const likely = maximized(tag).baseName;
  return shipped.find((code) => maximized(code).baseName === likely);
}

/**
 * The shipped locale whose catalog serves `locale`: the exact tag, then its
 * CLDR parent or the tag less its last subtag, repeatedly, never crossing a
 * script; `sourceLocale` when none ships.
 */
export function catalogLocale(
  locale: string,
  shipped: readonly string[],
  sourceLocale: string,
): string {
  const script = maximized(locale).script;
  for (const tag of fallbackChain(locale)) {
    if (maximized(tag).script !== script) continue;
    const match = shippedFor(tag, shipped);
    if (match !== undefined) return match;
  }
  return sourceLocale;
}

/**
 * A catalog set projected onto a site's enabled locales: each enabled
 * locale's catalog locale, so a runtime lookup reads it by the enabled
 * locale's code.
 */
export function projectCatalogLocales(
  enabled: readonly string[],
  shipped: readonly string[],
  sourceLocale: string,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    enabled.map((locale) => [
      locale,
      catalogLocale(locale, shipped, sourceLocale),
    ]),
  );
}

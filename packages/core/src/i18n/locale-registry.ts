import type { AuthenticatedUser } from "../context/app.js";

export type LocaleDirection = "ltr" | "rtl";

export interface LocaleInput {
  readonly code: string;
  readonly label?: string;
  readonly direction?: LocaleDirection;
  readonly enabled?: boolean;
}

export interface I18nInput {
  readonly defaultLocale: string;
  readonly locales: readonly (string | LocaleInput)[];
  readonly resolveLocale?: LocaleResolverOverride;
}

// Escape hatch for sites that want Accept-Language detection, URL-prefix
// routing, or any other resolution model WP doesn't do natively. Return
// `null` to fall through; out-of-registry / disabled returns are also ignored.
export type LocaleResolverOverride = (
  request: Request,
  user: AuthenticatedUser | null,
) => ResolvedLocale | null;

export interface ResolvedLocale {
  readonly code: string;
  readonly label: string;
  readonly direction: LocaleDirection;
  readonly enabled: boolean;
}

export interface ResolvedI18n {
  readonly defaultLocale: ResolvedLocale;
  readonly locales: readonly ResolvedLocale[];
  readonly resolveLocale?: LocaleResolverOverride;
}

// `Intl.Locale.prototype.getTextInfo()` shipped in V8/Node/Workers but the
// stock TS lib (5.x) hasn't picked it up yet — narrow shim here, scoped to
// the one property we read.
interface LocaleWithTextInfo {
  getTextInfo(): { direction: LocaleDirection };
}

export function resolveLocales(input: I18nInput): ResolvedI18n {
  const locales = input.locales.map((entry) => normalizeEntry(entry));
  const defaultCode = canonicalizeLocaleCode(input.defaultLocale);
  const defaultLocale = locales.find((l) => l.code === defaultCode);
  if (!defaultLocale) {
    // eslint-disable-next-line no-restricted-syntax -- TODO migrate to a named factory in a follow-up slice
    throw new Error(
      `plumix(): i18n.defaultLocale ${JSON.stringify(input.defaultLocale)} is not present in i18n.locales.`,
    );
  }
  if (!defaultLocale.enabled) {
    // eslint-disable-next-line no-restricted-syntax -- TODO migrate to a named factory in a follow-up slice
    throw new Error(
      `plumix(): i18n.defaultLocale ${JSON.stringify(input.defaultLocale)} cannot be marked enabled:false.`,
    );
  }
  return { defaultLocale, locales, resolveLocale: input.resolveLocale };
}

function normalizeEntry(entry: string | LocaleInput): ResolvedLocale {
  const input: LocaleInput =
    typeof entry === "string" ? { code: entry } : entry;
  const locale = canonicalize(input.code);
  return {
    code: locale.toString(),
    label: input.label ?? labelFor(locale),
    direction: validateDirection(
      input.direction ??
        (locale as unknown as LocaleWithTextInfo).getTextInfo().direction,
      input.code,
    ),
    enabled: input.enabled ?? true,
  };
}

// `direction` is the only registry field that flows raw into rendered HTML
// (`<html dir="${direction}">`). Validate at the type seam so a misuse of the
// union via `as any` can't punch out of the attribute.
function validateDirection(raw: unknown, code: string): LocaleDirection {
  if (raw === "ltr" || raw === "rtl") return raw;
  // eslint-disable-next-line no-restricted-syntax -- TODO migrate to a named factory in a follow-up slice
  throw new Error(
    `plumix(): i18n locale ${JSON.stringify(code)} direction must be "ltr" or "rtl", got ${JSON.stringify(raw)}.`,
  );
}

function canonicalize(raw: string): Intl.Locale {
  try {
    return new Intl.Locale(raw.replace(/_/g, "-"));
  } catch {
    // eslint-disable-next-line no-restricted-syntax -- TODO migrate to a named factory in a follow-up slice
    throw new Error(
      `plumix(): i18n locale code ${JSON.stringify(raw)} is not a valid BCP 47 tag.`,
    );
  }
}

function canonicalizeLocaleCode(raw: string): string {
  return canonicalize(raw).toString();
}

/**
 * Match a code from an untrusted source (user.meta, override return) against
 * the registry. Canonicalizes the input so `"en_US"` / `"en-us"` still find
 * an `"en-US"` entry. Returns the registry entry only if it's enabled.
 */
export function findEnabledLocale(
  i18n: ResolvedI18n,
  rawCode: string,
): ResolvedLocale | null {
  let code: string;
  try {
    code = canonicalizeLocaleCode(rawCode);
  } catch {
    return null;
  }
  return i18n.locales.find((l) => l.code === code && l.enabled) ?? null;
}

// `Intl.DisplayNames` rejects some valid BCP 47 tags its constructor doesn't
// recognize (Unicode extensions like `en-u-ca-gregory`, private-use `-x-…`),
// and `.of()` returns undefined when the active ICU build lacks the
// language — fall back to the bare code in both cases.
function labelFor(locale: Intl.Locale): string {
  const code = locale.toString();
  try {
    return new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

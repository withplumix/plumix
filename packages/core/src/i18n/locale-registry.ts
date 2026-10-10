import { I18nConfigError } from "./errors.js";

export type LocaleDirection = "ltr" | "rtl";

export interface LocaleInput {
  readonly code: string;
  readonly label?: string;
  readonly direction?: LocaleDirection;
  readonly enabled?: boolean;
}

/**
 * Generic over the user an override is handed: `i18n/` sits below the
 * context and cannot name `AuthenticatedUser`, so `config.ts` instantiates
 * these as `I18nInput`, `LocaleResolverOverride` and `ResolvedI18n`.
 */
export interface I18nInputFor<TUser> {
  readonly defaultLocale: string;
  readonly locales: readonly (string | LocaleInput)[];
  readonly resolveLocale?: LocaleResolverOverrideFor<TUser>;
}

/**
 * Escape hatch for sites that want Accept-Language detection, URL-prefix
 * routing, or any other resolution model WP doesn't do natively. Return
 * `null` to fall through; out-of-registry / disabled returns are also ignored.
 */
export type LocaleResolverOverrideFor<TUser> = (
  request: Request,
  user: TUser | null,
) => ResolvedLocale | null;

export interface ResolvedLocale {
  readonly code: string;
  readonly label: string;
  readonly direction: LocaleDirection;
  readonly enabled: boolean;
}

/** The resolved locales a lookup reads, without the override. */
export interface LocaleRegistry {
  readonly defaultLocale: ResolvedLocale;
  readonly locales: readonly ResolvedLocale[];
}

export interface ResolvedI18nFor<TUser> extends LocaleRegistry {
  readonly resolveLocale?: LocaleResolverOverrideFor<TUser>;
}

/**
 * `Intl.Locale.prototype.getTextInfo()` shipped in V8/Node/Workers but the
 * stock TS lib (5.x) hasn't picked it up yet — narrow shim here, scoped to
 * the one property we read.
 */
interface LocaleWithTextInfo {
  getTextInfo(): { direction: LocaleDirection };
}

export function resolveLocales<TUser>(
  input: I18nInputFor<TUser>,
): ResolvedI18nFor<TUser> {
  const locales = input.locales.map((entry) => normalizeEntry(entry));
  const defaultCode = canonicalizeLocaleCode(input.defaultLocale);
  const defaultLocale = locales.find((l) => l.code === defaultCode);
  if (!defaultLocale) {
    throw I18nConfigError.defaultLocaleNotListed(input.defaultLocale);
  }
  if (!defaultLocale.enabled) {
    throw I18nConfigError.defaultLocaleDisabled(input.defaultLocale);
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
      input.direction ?? textInfoDirection(locale),
      input.code,
    ),
    enabled: input.enabled ?? true,
  };
}

function textInfoDirection(locale: Intl.Locale): LocaleDirection {
  // Safety: `getTextInfo` exists on `Intl.Locale` in every V8 runtime plumix
  // targets, and `validateDirection` re-checks the value.
  return (locale as unknown as LocaleWithTextInfo).getTextInfo().direction;
}

/**
 * `direction` flows raw into `<html dir>`, so an `as any` misuse must not
 * punch out of the attribute.
 */
function validateDirection(raw: unknown, code: string): LocaleDirection {
  if (raw === "ltr" || raw === "rtl") return raw;
  throw I18nConfigError.invalidDirection(code, raw);
}

function canonicalize(raw: string): Intl.Locale {
  try {
    return new Intl.Locale(raw.replace(/_/g, "-"));
  } catch {
    throw I18nConfigError.invalidLocaleTag(raw);
  }
}

function canonicalizeLocaleCode(raw: string): string {
  return canonicalize(raw).toString();
}

/** Canonicalizes, so `"en_US"` finds `"en-US"`. Only enabled entries match. */
export function findEnabledLocale(
  i18n: LocaleRegistry,
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

/**
 * `Intl.DisplayNames` rejects some valid tags (Unicode extensions, private
 * use), and `.of()` is undefined when ICU lacks the language.
 */
function labelFor(locale: Intl.Locale): string {
  const code = locale.toString();
  try {
    return new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

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
}

export interface ResolvedLocale {
  readonly code: string;
  readonly label: string;
  readonly direction: LocaleDirection;
  readonly enabled: boolean;
}

export interface ResolvedI18n {
  readonly defaultLocale: ResolvedLocale;
  readonly locales: readonly ResolvedLocale[];
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
  return { defaultLocale, locales };
}

function normalizeEntry(entry: string | LocaleInput): ResolvedLocale {
  const input: LocaleInput =
    typeof entry === "string" ? { code: entry } : entry;
  const locale = canonicalize(input.code);
  return {
    code: locale.toString(),
    label: input.label ?? labelFor(locale),
    direction:
      input.direction ??
      (locale as unknown as LocaleWithTextInfo).getTextInfo().direction,
    enabled: input.enabled ?? true,
  };
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

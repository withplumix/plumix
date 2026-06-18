type I18nConfigErrorCode =
  | "default_locale_not_listed"
  | "default_locale_disabled"
  | "invalid_direction"
  | "invalid_locale_tag";

/**
 * i18n config invariant violated while resolving {@link plumix}'s `i18n`
 * block. The `code` discriminant carries which rule failed; the offending
 * value is interpolated into the message. Named-error convention (#232).
 */
export class I18nConfigError extends Error {
  static {
    I18nConfigError.prototype.name = "I18nConfigError";
  }

  readonly code: I18nConfigErrorCode;

  private constructor(code: I18nConfigErrorCode, message: string) {
    super(message);
    this.code = code;
  }

  static defaultLocaleNotListed(defaultLocale: string): I18nConfigError {
    return new I18nConfigError(
      "default_locale_not_listed",
      `plumix(): i18n.defaultLocale ${JSON.stringify(defaultLocale)} is not present in i18n.locales.`,
    );
  }

  static defaultLocaleDisabled(defaultLocale: string): I18nConfigError {
    return new I18nConfigError(
      "default_locale_disabled",
      `plumix(): i18n.defaultLocale ${JSON.stringify(defaultLocale)} cannot be marked enabled:false.`,
    );
  }

  static invalidDirection(code: string, raw: unknown): I18nConfigError {
    return new I18nConfigError(
      "invalid_direction",
      `plumix(): i18n locale ${JSON.stringify(code)} direction must be "ltr" or "rtl", got ${JSON.stringify(raw)}.`,
    );
  }

  static invalidLocaleTag(raw: string): I18nConfigError {
    return new I18nConfigError(
      "invalid_locale_tag",
      `plumix(): i18n locale code ${JSON.stringify(raw)} is not a valid BCP 47 tag.`,
    );
  }
}

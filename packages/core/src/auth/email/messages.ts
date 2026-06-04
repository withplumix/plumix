// Locale-keyed email subject + body fragments. Plumix's emails go out
// pre-auth (magic-link) or to a user whose locale we know (email-change),
// so the table is keyed by locale code with English as the fallback.
//
// Hand-rolled rather than going through Lingui's server-side `setupI18n`
// — emails are a small, slow-moving surface; the operator cost of
// maintaining a separate server catalog (loaded via `load-catalog.ts`,
// merged into a per-locale `i18n` instance, accessed via `_()`) wasn't
// worth it for ~10 strings. Promote to Lingui when a fifth or sixth
// transactional email lands and the table starts duplicating chrome.

interface MagicLinkMessages {
  readonly subject: (siteName: string) => string;
  readonly body: (siteName: string, url: string, ttlSeconds: number) => string;
}

interface EmailChangeMessages {
  readonly subject: (siteName: string) => string;
  readonly body: (args: {
    readonly siteName: string;
    readonly oldEmail: string;
    readonly newEmail: string;
    readonly url: string;
    readonly ttlSeconds: number;
  }) => string;
}

interface EmailLocaleStrings {
  readonly magicLink: MagicLinkMessages;
  readonly emailChange: EmailChangeMessages;
}

const en: EmailLocaleStrings = {
  magicLink: {
    subject: (siteName) => `Sign in to ${siteName}`,
    body: (siteName, url, ttlSeconds) =>
      [
        `Sign in to ${siteName} by opening this link:`,
        "",
        url,
        "",
        `The link expires in ${Math.round(ttlSeconds / 60)} minutes.`,
        "",
        "If you didn't request this, you can ignore this email.",
      ].join("\n"),
  },
  emailChange: {
    subject: (siteName) => `Confirm your new email for ${siteName}`,
    body: ({ siteName, oldEmail, newEmail, url, ttlSeconds }) =>
      [
        `Someone — hopefully you — asked to change the email on your ${siteName} account.`,
        "",
        `From: ${oldEmail}`,
        `To:   ${newEmail}`,
        "",
        "Confirm the change by opening this link:",
        "",
        url,
        "",
        `The link expires in ${Math.round(ttlSeconds / 3600)} hour${
          Math.round(ttlSeconds / 3600) === 1 ? "" : "s"
        }.`,
        "",
        `If you didn't request this, you can ignore this email — your account stays on ${oldEmail}.`,
      ].join("\n"),
  },
};

const de: EmailLocaleStrings = {
  magicLink: {
    subject: (siteName) => `Bei ${siteName} anmelden`,
    body: (siteName, url, ttlSeconds) =>
      [
        `Melden Sie sich bei ${siteName} über diesen Link an:`,
        "",
        url,
        "",
        `Der Link läuft in ${Math.round(ttlSeconds / 60)} Minuten ab.`,
        "",
        "Falls Sie dies nicht angefordert haben, können Sie diese E-Mail ignorieren.",
      ].join("\n"),
  },
  emailChange: {
    subject: (siteName) => `Bestätigen Sie Ihre neue E-Mail für ${siteName}`,
    body: ({ siteName, oldEmail, newEmail, url, ttlSeconds }) =>
      [
        `Jemand — hoffentlich Sie — hat darum gebeten, die E-Mail-Adresse Ihres ${siteName}-Kontos zu ändern.`,
        "",
        `Von: ${oldEmail}`,
        `An:  ${newEmail}`,
        "",
        "Bestätigen Sie die Änderung über diesen Link:",
        "",
        url,
        "",
        `Der Link läuft in ${Math.round(ttlSeconds / 3600)} Stunde${
          Math.round(ttlSeconds / 3600) === 1 ? "" : "n"
        } ab.`,
        "",
        `Falls Sie dies nicht angefordert haben, können Sie diese E-Mail ignorieren — Ihr Konto bleibt bei ${oldEmail}.`,
      ].join("\n"),
  },
};

// Locale-fallback chain: exact match → base-language (e.g. `de-AT` → `de`)
// → English. Same shape as `findEnabledLocale` for consistency without
// importing the registry (avoids coupling auth/email to i18n/locale-registry
// which only the public-route resolver consumes).
const LOCALES = { en, de } satisfies Record<string, EmailLocaleStrings>;
type LocaleKey = keyof typeof LOCALES;

function isLocaleKey(value: string): value is LocaleKey {
  return value in LOCALES;
}

export function emailStringsFor(
  locale: string | undefined,
): EmailLocaleStrings {
  if (!locale) return en;
  if (isLocaleKey(locale)) return LOCALES[locale];
  const base = locale.split("-")[0];
  if (base && isLocaleKey(base)) return LOCALES[base];
  return en;
}

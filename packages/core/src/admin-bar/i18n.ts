// Inline catalog — 9 strings, SSR-only, fixed locale set; not worth a
// Lingui pipeline. Wider set ships when `pnpm i18n:check` moves into core.

export type BarLocale = "en" | "de" | "uk" | "ar" | "zh-CN";

export interface BarStrings {
  readonly siteFallback: string;
  readonly newGroup: string;
  readonly newGroupAria: string;
  readonly edit: string;
  readonly account: string;
  readonly navAria: string;
}

const CATALOGS: Readonly<Record<BarLocale, BarStrings>> = {
  en: {
    siteFallback: "Site",
    newGroup: "+ New",
    newGroupAria: "Create new",
    edit: "Edit",
    account: "Account",
    navAria: "Admin",
  },
  de: {
    siteFallback: "Website",
    newGroup: "+ Neu",
    newGroupAria: "Neu erstellen",
    edit: "Bearbeiten",
    account: "Konto",
    navAria: "Administration",
  },
  uk: {
    siteFallback: "Сайт",
    newGroup: "+ Новий",
    newGroupAria: "Створити",
    edit: "Редагувати",
    account: "Обліковий запис",
    navAria: "Адміністрування",
  },
  ar: {
    siteFallback: "الموقع",
    newGroup: "+ جديد",
    newGroupAria: "إنشاء جديد",
    edit: "تعديل",
    account: "الحساب",
    navAria: "الإدارة",
  },
  "zh-CN": {
    siteFallback: "站点",
    newGroup: "+ 新建",
    newGroupAria: "新建内容",
    edit: "编辑",
    account: "账户",
    navAria: "管理",
  },
};

const KNOWN: ReadonlySet<string> = new Set(Object.keys(CATALOGS));

/**
 * Resolves the admin user's bar locale from `meta.locale` (per WP semantics —
 * `get_user_locale()`, not `get_locale()`). Falls back to English when the
 * user has no stored locale or stored a locale we don't ship strings for.
 */
export function resolveBarLocale(user: {
  readonly meta: Record<string, unknown>;
}): BarLocale {
  const stored = user.meta.locale;
  if (typeof stored === "string" && KNOWN.has(stored)) {
    return stored as BarLocale;
  }
  return "en";
}

export function barMessages(locale: BarLocale): BarStrings {
  return CATALOGS[locale];
}

export function barDirection(locale: BarLocale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

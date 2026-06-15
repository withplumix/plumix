// Welcome-screen strings follow the admin-bar pattern: hand-authored
// `locales/welcome-*.po` catalogs compiled to static modules and looked up
// per-request server-side (no `activate()` singleton). `plumix i18n verify`
// gates descriptor↔catalog drift. Non-English catalogs ship untranslated;
// `lingui compile` (no `--strict`) backfills missing entries with the English
// source, so an untranslated locale renders English until a translator fills
// its `.po`. The `welcome-` prefix keeps this surface distinct in the flat dir.

import { messages as arMessages } from "@plumix/core/locales/welcome-ar";
import { messages as deMessages } from "@plumix/core/locales/welcome-de";
import { messages as enMessages } from "@plumix/core/locales/welcome-en";
import { messages as ukMessages } from "@plumix/core/locales/welcome-uk";
import { messages as zhCnMessages } from "@plumix/core/locales/welcome-zh-CN";

type CompiledCatalog = Record<string, string | readonly string[]>;

const CATALOGS: Readonly<Record<string, CompiledCatalog>> = {
  en: enMessages,
  de: deMessages,
  uk: ukMessages,
  ar: arMessages,
  "zh-CN": zhCnMessages,
};

// Source descriptors — `plumix i18n verify` matches these against the po
// catalogs; `message` is the English source and the runtime fallback.
const M = {
  running: { id: "core.welcome.running", message: "plumix is running" },
  heading: { id: "core.welcome.heading", message: "Your site is ready." },
  body: {
    id: "core.welcome.body",
    message: "Add a theme in plumix.config.ts to design your public site.",
  },
  or: { id: "core.welcome.or", message: "or" },
  openAdmin: { id: "core.welcome.openAdmin", message: "Open admin" },
} as const;

export interface WelcomeStrings {
  readonly running: string;
  readonly heading: string;
  readonly body: string;
  readonly or: string;
  readonly openAdmin: string;
}

function resolveMessage(
  catalog: CompiledCatalog,
  descriptor: { readonly id: string; readonly message: string },
): string {
  const value = catalog[descriptor.id];
  const text = typeof value === "string" ? value : value?.[0];
  return typeof text === "string" && text.length > 0
    ? text
    : descriptor.message;
}

export function welcomeMessages(locale: string): WelcomeStrings {
  // `locale` is the resolved `ctx.locale.code` (an arbitrary string), so an
  // unshipped locale falls back to the English catalog.
  const catalog = CATALOGS[locale] ?? enMessages;
  return {
    running: resolveMessage(catalog, M.running),
    heading: resolveMessage(catalog, M.heading),
    body: resolveMessage(catalog, M.body),
    or: resolveMessage(catalog, M.or),
    openAdmin: resolveMessage(catalog, M.openAdmin),
  };
}

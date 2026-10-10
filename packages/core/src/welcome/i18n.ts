// Non-English catalogs ship untranslated; `lingui compile` without `--strict`
// backfills English until a translator fills the `.po`.

import { messages as arMessages } from "@plumix/core/locales/welcome-ar";
import { messages as deMessages } from "@plumix/core/locales/welcome-de";
import { messages as enMessages } from "@plumix/core/locales/welcome-en";
import { messages as ukMessages } from "@plumix/core/locales/welcome-uk";
import { messages as zhCnMessages } from "@plumix/core/locales/welcome-zh-CN";

import type { CompiledCatalog } from "../blocks/index.js";
import { resolveMessage } from "../blocks/index.js";

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

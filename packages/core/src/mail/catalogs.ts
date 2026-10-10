// Unit tests resolve these static imports to empty catalogs, so a test of
// translated output hands the `.po` in as a plugin catalog.

import { messages as arMessages } from "@plumix/core/locales/mail-ar";
import { messages as deMessages } from "@plumix/core/locales/mail-de";
import { messages as enMessages } from "@plumix/core/locales/mail-en";
import { messages as ukMessages } from "@plumix/core/locales/mail-uk";
import { messages as zhCnMessages } from "@plumix/core/locales/mail-zh-CN";

import type { CompiledCatalog } from "../blocks/index.js";
import type { PluginCatalogs } from "../route/render/block-catalog.js";

const CORE_MAIL_CATALOGS: Readonly<Record<string, CompiledCatalog>> = {
  en: enMessages,
  de: deMessages,
  uk: ukMessages,
  ar: arMessages,
  "zh-CN": zhCnMessages,
};

/** The merged catalog a mail renders against, for one locale. */
export type MailCatalogs = (locale: string) => Promise<CompiledCatalog>;

export function createMailCatalogs(
  pluginCatalogs: PluginCatalogs = {},
): MailCatalogs {
  // Once per locale per isolate: the catalogs are static build output.
  const merged = new Map<string, Promise<CompiledCatalog>>();
  return (locale) => {
    let catalog = merged.get(locale);
    if (catalog === undefined) {
      catalog = Promise.all(
        (pluginCatalogs[locale] ?? []).map((load) => load()),
      ).then((modules) =>
        modules.reduce<CompiledCatalog>(
          (acc, module) => ({ ...acc, ...module.messages }),
          CORE_MAIL_CATALOGS[locale] ?? {},
        ),
      );
      merged.set(locale, catalog);
    }
    return catalog;
  };
}

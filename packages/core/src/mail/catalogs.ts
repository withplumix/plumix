// Unit tests resolve core's catalogs to empty ones, so a test of
// translated output hands the `.po` in as a plugin catalog.

import { catalogs } from "@plumix/core/locales/index/mail";

import type { CompiledCatalog } from "../blocks/index.js";
import type { PluginCatalogs } from "../route/render/block-catalog.js";
import { lazyCatalogs } from "../blocks/lazy-catalogs.js";

/** The merged catalog a mail renders against, for one locale. */
export type MailCatalogs = (locale: string) => Promise<CompiledCatalog>;

export function createMailCatalogs(
  pluginCatalogs: PluginCatalogs = {},
): MailCatalogs {
  const core = lazyCatalogs(catalogs);
  // Once per locale per isolate: the catalogs are static build output.
  const merged = new Map<string, Promise<CompiledCatalog>>();
  return (locale) => {
    let catalog = merged.get(locale);
    if (catalog === undefined) {
      catalog = Promise.all([
        core.load(locale),
        ...(pluginCatalogs[locale] ?? []).map((load) => load()),
      ]).then(([base, ...modules]) =>
        modules.reduce<CompiledCatalog>(
          (acc, module) => ({ ...acc, ...module.messages }),
          base,
        ),
      );
      merged.set(locale, catalog);
    }
    return catalog;
  };
}

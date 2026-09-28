// Block render strings resolve through `BlockContext.t` against one compiled
// catalog per request locale: core's blocks catalog (core-block and
// renderer strings) under every installed plugin's. Plugin catalogs reach the
// Worker through `virtual:plumix/plugin-catalogs`, which the Vite plugin
// generates from each plugin's `i18n` slot — there's no fs at request time.
// Unit tests resolve these static imports to empty catalogs, so an unwired
// locale renders the descriptors' English source.

import { messages as arMessages } from "@plumix/core/locales/blocks-ar";
import { messages as deMessages } from "@plumix/core/locales/blocks-de";
import { messages as enMessages } from "@plumix/core/locales/blocks-en";
import { messages as ukMessages } from "@plumix/core/locales/blocks-uk";
import { messages as zhCnMessages } from "@plumix/core/locales/blocks-zh-CN";

import type { CompiledCatalog } from "../../blocks/index.js";

const BLOCKS_CATALOGS: Readonly<Record<string, CompiledCatalog>> = {
  en: enMessages,
  de: deMessages,
  uk: ukMessages,
  ar: arMessages,
  "zh-CN": zhCnMessages,
};

/** A compiled catalog module, as `lingui compile --namespace es` emits it. */
interface CatalogModule {
  readonly messages: CompiledCatalog;
}

/** Locale → a loader per installed plugin that ships a catalog for it. */
export type PluginCatalogs = Readonly<
  Record<string, readonly (() => Promise<CatalogModule>)[]>
>;

/** The merged block-render catalog for a request locale. */
export type BlockCatalogs = (locale: string) => Promise<CompiledCatalog>;

export function createBlockCatalogs(
  pluginCatalogs: PluginCatalogs = {},
): BlockCatalogs {
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
          BLOCKS_CATALOGS[locale] ?? {},
        ),
      );
      merged.set(locale, catalog);
    }
    return catalog;
  };
}

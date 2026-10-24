// Non-English catalogs ship untranslated; `lingui compile` without `--strict`
// backfills English until a translator fills the `.po`.

import { catalogs } from "@plumix/core/locales/index/welcome";

import type { CatalogIndex, CatalogLocales } from "../blocks/lazy-catalogs.js";
import { resolveMessage } from "../blocks/index.js";
import { lazyCatalogs } from "../blocks/lazy-catalogs.js";

/**
 * Source descriptors — `plumix i18n verify` matches these against the po
 * catalogs; `message` is the English source and the runtime fallback.
 */
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

export interface WelcomeCatalogs {
  /** Imports `locale`'s catalog for {@link WelcomeCatalogs.strings} to read. */
  load(locale: string): Promise<void>;
  /**
   * Read in a render, which cannot await, so `load` runs first. `locale` is
   * the resolved `ctx.locale.code`, so a locale with no catalog reads the
   * descriptors' English.
   */
  strings(locale: string): WelcomeStrings;
}

/**
 * `catalogLocales` is the welcome catalogs projected onto the site's enabled
 * locales, from `virtual:plumix/catalog-locales`.
 */
export function welcomeCatalogs(
  catalogLocales?: CatalogLocales,
  index: CatalogIndex = catalogs,
): WelcomeCatalogs {
  const core = lazyCatalogs(index, catalogLocales);
  return {
    async load(locale) {
      await core.load(locale);
    },
    strings(locale) {
      const catalog = core.loaded(locale);
      return {
        running: resolveMessage(catalog, M.running),
        heading: resolveMessage(catalog, M.heading),
        body: resolveMessage(catalog, M.body),
        or: resolveMessage(catalog, M.or),
        openAdmin: resolveMessage(catalog, M.openAdmin),
      };
    },
  };
}

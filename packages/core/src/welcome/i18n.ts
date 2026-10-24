// Non-English catalogs ship untranslated; `lingui compile` without `--strict`
// backfills English until a translator fills the `.po`.

import { catalogs } from "@plumix/core/locales/index/welcome";

import { resolveMessage } from "../blocks/index.js";
import { lazyCatalogs } from "../blocks/lazy-catalogs.js";

const CATALOGS = lazyCatalogs(catalogs);

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

/** Imports `locale`'s catalog for {@link welcomeMessages} to read. */
export async function loadWelcomeCatalog(locale: string): Promise<void> {
  await CATALOGS.load(locale);
}

/**
 * Read in a render, which cannot await, so `loadWelcomeCatalog` runs first.
 * `locale` is the resolved `ctx.locale.code` (an arbitrary string), so an
 * unshipped locale reads the descriptors' English.
 */
export function welcomeMessages(locale: string): WelcomeStrings {
  const catalog = CATALOGS.loaded(locale);
  return {
    running: resolveMessage(catalog, M.running),
    heading: resolveMessage(catalog, M.heading),
    body: resolveMessage(catalog, M.body),
    or: resolveMessage(catalog, M.or),
    openAdmin: resolveMessage(catalog, M.openAdmin),
  };
}

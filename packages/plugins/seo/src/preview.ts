import type { EntryData } from "plumix";
import type { AppContext } from "plumix/plugin";
import {
  buildEntryPermalink,
  loadSiteSettings,
  pageFacts,
} from "plumix/plugin";

import type { SerpPreview } from "./serp.js";
import { indexable } from "./indexable.js";
import { SEO_META_KEYS } from "./meta-keys.js";
import { patternTitle } from "./page-title.js";
import { loadSeoSettings, nonEmpty } from "./settings.js";

/**
 * Computed through the functions the head runs, before unsaved answers; the
 * editor overlays the search title, description and `noindex` live.
 */
export async function serpPreview(
  ctx: AppContext,
  page: EntryData,
): Promise<SerpPreview> {
  const { entry } = page;
  const [site, settings, path] = await Promise.all([
    loadSiteSettings(ctx),
    loadSeoSettings(ctx),
    buildEntryPermalink(ctx, entry),
  ]);
  const data = withoutOverride(page);
  const facts = pageFacts(data);
  const decision = indexable(facts, settings);
  return {
    // A type with no public URL still previews — a search result with no link
    // is what such a page would be, and saying so beats an empty panel.
    url: `${ctx.origin}${path ?? ""}`,
    title:
      patternTitle(settings, {
        facts,
        data,
        title: entry.title,
        siteName: nonEmpty(site.title),
        localeCode: ctx.locale.code,
      }) ?? entry.title,
    // The same fallback the head writes, minus the author's own override.
    description: nonEmpty(entry.excerpt) ?? nonEmpty(site.tagline) ?? "",
    indexable: decision.indexable,
    reason: decision.reason,
  };
}

/**
 * The saved `noindex` would contradict the live toggle the author is looking
 * at.
 */
function withoutOverride(page: EntryData): EntryData {
  const { [SEO_META_KEYS.noindex]: _noindex, ...meta } = page.entry.meta;
  return { ...page, entry: { ...page.entry, meta } };
}

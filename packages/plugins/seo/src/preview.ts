import type { ResolvedEntry, TemplateData } from "plumix";
import type { AppContext } from "plumix/plugin";
import { buildEntryPermalink, loadSiteSettings, pageFacts } from "plumix";

import type { SerpPreview } from "./serp.js";
import { indexable } from "./indexable.js";
import { SEO_META_KEYS } from "./meta-keys.js";
import { patternTitle } from "./page-title.js";
import { loadSeoSettings, nonEmpty } from "./settings.js";

/**
 * What this entry will look like in a search result, before the answers its
 * author is holding unsaved.
 *
 * Everything the editor cannot work out for itself: the permalink, the site's
 * own name, the type's title pattern, and the chain's verdict on whether the
 * page is offered to search engines at all — each through the function the
 * head runs, so the preview cannot show what the page will not carry. The
 * editor overlays the search title, the search description and the `noindex`
 * toggle live.
 */
export async function serpPreview(
  ctx: AppContext,
  entry: ResolvedEntry,
): Promise<SerpPreview> {
  const [site, settings, path] = await Promise.all([
    loadSiteSettings(ctx),
    loadSeoSettings(ctx),
    buildEntryPermalink(ctx, entry),
  ]);
  const data: TemplateData = { kind: "entry", entry: withoutOverride(entry) };
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

// The entry with its own `noindex` set aside: the editor holds a live answer
// for that one flag, and a preview computed from the saved one would contradict
// the toggle the author is looking at. Fed through `pageFacts` rather than
// hand-built, so what the chain reads here is what it reads on a render.
function withoutOverride(entry: ResolvedEntry): ResolvedEntry {
  const { [SEO_META_KEYS.noindex]: _noindex, ...meta } = entry.meta;
  return { ...entry, meta };
}

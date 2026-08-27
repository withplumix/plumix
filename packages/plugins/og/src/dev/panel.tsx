import type { DebugKVRow, DebugPanel, DebugSnapshot } from "plumix";
import { DebugKV, DebugSection, isJsonObject } from "plumix";

import type { OgCardSkip, OgChainOutcome, OgTrace } from "../chain-trace.js";
import { OG_PANEL_ID } from "../chain-trace.js";

// What each link of the chain is called, in the vocabulary the README uses.
// "if one is set" because core's tail is `?? (siteDefault ? … : null)`: with no
// `site.default_og_image` row the page carries no `og:image` at all, and the
// plugin cannot see which of the two it is from inside the filter.
const OUTCOME_LABEL: Record<OgChainOutcome, string> = {
  supplied: "Another seo:og_image subscriber",
  card: "Generated card",
  featured: "Featured photo",
  "site-default": "Site default, if one is set",
};

// Why no card is on the page — the question the panel exists to answer, and
// the reason a renderer whose format scrapers cannot read needs no boot-time
// warning of its own.
const SKIP_REASON: Record<OgCardSkip, string> = {
  "page-kind":
    "Only entries have a card URL — nothing addresses this page kind",
  "no-rule": "No card rule matched",
  "renderer-format":
    "The renderer's format is not scraper-safe, so the route serves the card " +
    "but the head cannot advertise it",
  "not-shareable":
    "The entry is not publicly shareable — draft, private type, or access-gated",
  "featured-preferred":
    'mode: "auto" — a card steps aside for an entry that has a photo of its own',
};

/**
 * The `og:image` chain for the page, and which of its four links produced the
 * image. The chain resolves inside core and leaves no trace in the markup, so
 * without this the only way to tell a missing rule from an unadvertisable
 * format is to go and read the plugin.
 */
export function ogDebugPanel(): DebugPanel {
  return {
    id: OG_PANEL_ID,
    title: "OG image",
    order: 60,
    render: (snapshot) => (
      <DebugSection>
        <DebugKV rows={chainRows(snapshot)} />
      </DebugSection>
    ),
  };
}

function chainRows(snapshot: DebugSnapshot): readonly DebugKVRow[] {
  const traces = (snapshot.records[OG_PANEL_ID] ?? []).flatMap((record) =>
    // Safety: this namespace carries only what `pageOgImage` and the dev
    // module record, and both write an `OgTrace`.
    isJsonObject(record.data) ? [record.data as OgTrace] : [],
  );
  const page = traces.find((trace) => trace.phase === "page");
  const chain = traces.find((trace) => trace.phase === "chain");

  if (page === undefined) {
    return [{ label: "Chain", value: "No page rendered on this request" }];
  }
  // The filter runs on every page render, so its absence is core's one
  // short-circuit above it: an explicit `.ogImage()` role on the entry. Its
  // value never reaches this plugin — the chain returned before the filter —
  // so the row says where to read it rather than dropping out of the table.
  if (chain === undefined) {
    return [
      { label: "Page", value: page.pageKind },
      { label: "Resolved", value: "Read it off the page's og:image meta tag" },
      { label: "Produced by", value: "Explicit og:image role" },
    ];
  }

  const rows: DebugKVRow[] = [
    { label: "Page", value: page.pageKind },
    { label: "Resolved", value: chain.url ?? "nothing" },
    { label: "Produced by", value: OUTCOME_LABEL[chain.outcome] },
  ];
  if (chain.rule !== null) rows.push({ label: "Card rule", value: chain.rule });
  if (chain.skipped !== null) {
    rows.push({ label: "No card", value: SKIP_REASON[chain.skipped] });
  }
  return rows;
}

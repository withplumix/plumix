import type { DebugSnapshot } from "plumix";
import type { DebugKVRow, DebugPanel } from "plumix/plugin";
import { DebugKV, DebugSection } from "plumix/plugin";
import { isJsonObject } from "plumix/support";

import type { CardFontPlan } from "../card-fonts.js";
import type { OgCardSkip, OgChainOutcome, OgTrace } from "../chain-trace.js";
import { OG_PANEL_ID } from "../chain-trace.js";

/**
 * "if one is set": this plugin can't see from inside the filter whether a site
 * default exists. `supplied` means an earlier subscriber.
 */
const OUTCOME_LABEL: Record<OgChainOutcome, string> = {
  supplied: "Another seo:og_image subscriber",
  card: "Generated card",
  featured: "Featured photo",
  "site-default": "Site default, if one is set",
};

/**
 * Shown here instead of a boot-time warning for an unadvertisable renderer
 * format.
 */
const SKIP_REASON: Record<OgCardSkip, string> = {
  "page-kind":
    "This page kind cannot be named by a card URL — a search page's subject " +
    "is whatever was typed, and a plugin archive resolves from route " +
    "parameters",
  "no-rule": "No card rule matched",
  "renderer-format":
    "The renderer's format is not scraper-safe, so the route serves the card " +
    "but the head cannot advertise it",
  "not-shareable":
    "The page is not publicly shareable — a draft, a private or access-gated " +
    "entry, or an archive that lists nothing",
  "featured-preferred":
    'mode: "auto" — a card steps aside for an entry that has a photo of its own',
};

export interface OgDebugPanelOptions {
  /** The configured font set split by what the connected renderer reads. */
  readonly fonts: CardFontPlan;
}

/** Shows which `og:image` link won; the chain leaves no trace in the markup. */
export function ogDebugPanel(options: OgDebugPanelOptions): DebugPanel {
  const { fonts } = options;
  return {
    id: OG_PANEL_ID,
    title: "OG image",
    order: 60,
    render: (snapshot) => (
      <DebugSection>
        <DebugKV rows={[...chainRows(snapshot), ...fontRows(fonts)]} />
      </DebugSection>
    ),
  };
}

/** A face the renderer never receives leaves no visible mark on the card. */
function fontRows(plan: CardFontPlan): readonly DebugKVRow[] {
  if (plan.ignored.length > 0) {
    return [
      {
        label: "Fonts ignored",
        value:
          `${plan.ignored.join(", ")} — this renderer reads no fonts, so the ` +
          `configured set is never read or sent`,
      },
    ];
  }
  if (plan.unreadable.length > 0) {
    return [
      {
        label: "Fonts dropped",
        value:
          `${plan.unreadable.join(", ")} — this renderer reads ` +
          `${plan.formats.join(", ")}`,
      },
    ];
  }
  return [];
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
  // Either an explicit `.ogImage()` short-circuited the chain or
  // `@plumix/plugin-seo` isn't installed; this plugin can't tell which.
  if (chain === undefined) {
    return [
      { label: "Page", value: page.pageKind },
      { label: "Resolved", value: "Read it off the page's og:image meta tag" },
      {
        label: "Produced by",
        value: "Explicit og:image role, or @plumix/plugin-seo is not installed",
      },
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

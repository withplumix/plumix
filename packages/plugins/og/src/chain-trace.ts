import type { JsonObject } from "plumix";

// What the plugin records about the `og:image` chain, and the vocabulary the
// debug-bar panel reads it back in. The chain record is written from the main
// graph, so a sampled production trace carries it too; the page marker below is
// only ever registered under the development gate, because the question it
// answers is only ever asked by the panel.

/** The namespace both records use, which is also the panel's id. */
export const OG_PANEL_ID = "og";

/** Which link of the chain the page's `og:image` came off. */
export type OgChainOutcome =
  /** An earlier `seo:og_image` subscriber's image, which a card never outranks. */
  "supplied" | "card" | "featured" | "site-default";

/** Why the page carries no generated card. */
export type OgCardSkip =
  /** A search page or a plugin archive: no identity a card URL could name. */
  | "page-kind"
  | "no-rule"
  /** The connected renderer makes a format scrapers do not render. */
  | "renderer-format"
  /** Draft, private, access-gated, or an archive listing nothing — the route
   *  would refuse it too. */
  | "not-shareable"
  /** The entry's own photo won, which is what `mode: "auto"` asks for. */
  | "featured-preferred";

/**
 * Recorded once per page render, before the chain resolves, so the panel can
 * tell "the chain short-circuited above this plugin" — an explicit `.ogImage()`
 * role, the one link the `seo:og_image` filter never sees — apart from a
 * request that rendered no page at all.
 */
export interface OgPageTrace extends JsonObject {
  readonly phase: "page";
  readonly pageKind: string;
}

/** Recorded by the `seo:og_image` subscriber, with what it decided and why. */
export interface OgChainTrace extends JsonObject {
  readonly phase: "chain";
  readonly outcome: OgChainOutcome;
  /** The image the page ends up advertising, as far as this plugin can see it. */
  readonly url: string | null;
  /** The matched card rule, by core's own `ruleLabel`, or null when none did. */
  readonly rule: string | null;
  readonly skipped: OgCardSkip | null;
}

export type OgTrace = OgPageTrace | OgChainTrace;

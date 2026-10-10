import type { JsonObject } from "plumix";

// The chain record is also written in production traces; the page marker is
// registered only under the development gate.

/** The namespace both records use, which is also the panel's id. */
export const OG_PANEL_ID = "og";

// Declaring the id is what makes `dev: { panels: { og: false } }` type-check
// on a site with this plugin installed — and a mistyped one an error rather
// than a silent no-op.
declare module "plumix" {
  interface DebugPanelRegistry {
    og: true;
  }
}

/** Which link of the chain the page's `og:image` came off. */
export type OgChainOutcome =
  /**
   * An earlier `seo:og_image` subscriber's image, which a card never outranks.
   */
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
 * Lets the panel tell a chain short-circuited by `.ogImage()` apart from a
 * request that rendered no page.
 */
export interface OgPageTrace extends JsonObject {
  readonly phase: "page";
  readonly pageKind: string;
}

/** Recorded by the `seo:og_image` subscriber, with what it decided and why. */
export interface OgChainTrace extends JsonObject {
  readonly phase: "chain";
  readonly outcome: OgChainOutcome;
  /**
   * The image the page ends up advertising, as far as this plugin can see it.
   */
  readonly url: string | null;
  /**
   * The matched card rule, by core's own `ruleLabel`, or null when none did.
   */
  readonly rule: string | null;
  readonly skipped: OgCardSkip | null;
}

export type OgTrace = OgPageTrace | OgChainTrace;

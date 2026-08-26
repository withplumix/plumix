/**
 * A card's element tree. Plain JSON — no components, no CSS-in-JS — so a
 * renderer that lives off-box can be handed one over the wire. Styling is
 * carried by `className` against the stylesheets in {@link CardRenderInput},
 * which is what lets a card use the theme's own custom properties.
 */
export type CardNode = CardContainerNode | CardTextNode;

export interface CardContainerNode {
  readonly type: "container";
  readonly className?: string;
  readonly children?: readonly CardNode[];
}

export interface CardTextNode {
  readonly type: "text";
  readonly className?: string;
  readonly text: string;
}

export interface CardRenderInput {
  readonly width: number;
  readonly height: number;
  readonly stylesheets: readonly string[];
  /** Font files read out of the platform asset layer, in fallback order. */
  readonly fonts: readonly Uint8Array[];
  /**
   * The request's traced `fetch`. Passed in rather than reached for globally so
   * a renderer that calls out — the remote one — lands in the request waterfall
   * like every other outbound call.
   */
  readonly fetch: typeof globalThis.fetch;
}

export interface CardRenderer {
  /**
   * What {@link CardRenderer.render} produces. Declared up front because the
   * route has to name the type — in the URL's extension and in the served
   * headers — before any render has happened.
   */
  readonly contentType: string;
  render(node: CardNode, input: CardRenderInput): Promise<Uint8Array>;
}

export const SVG_CONTENT_TYPE = "image/svg+xml";
export const PNG_CONTENT_TYPE = "image/png";

/** The size every major scraper expects. */
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

// The URL carries the output format in its extension, so a CDN keyed on
// extension behaves and the link is self-describing. A content type with no
// entry has no servable URL, which is the check the route makes.
const EXTENSIONS = new Map<string, string>([
  [SVG_CONTENT_TYPE, "svg"],
  [PNG_CONTENT_TYPE, "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

export function extensionFor(contentType: string): string | undefined {
  return EXTENSIONS.get(contentType);
}

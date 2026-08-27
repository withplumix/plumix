/**
 * A card's element tree. Plain JSON — no components, no CSS-in-JS — so a
 * renderer that lives off-box can be handed one over the wire. Styling is
 * carried by `className` against the stylesheets in {@link CardRenderInput},
 * which is what lets a card use the theme's own custom properties.
 */
export type CardNode = CardContainerNode | CardTextNode | CardImageNode;

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

/**
 * An image node. Its `src` is an identifier, not something a renderer fetches:
 * the plugin resolves it before the render and hands the bytes over in
 * {@link CardRenderInput.images}, keyed by this same string. A `data:` URI is
 * the exception that proves it — it carries its own bytes.
 */
export interface CardImageNode {
  readonly type: "image";
  readonly className?: string;
  readonly src: string;
  readonly width?: number;
  readonly height?: number;
}

/** One resolved image: the `src` a node names it by, and the bytes behind it. */
export interface CardImage {
  readonly src: string;
  readonly data: Uint8Array;
}

export interface CardRenderInput {
  readonly width: number;
  readonly height: number;
  readonly stylesheets: readonly string[];
  /** Font files read out of the platform asset layer, in fallback order. */
  readonly fonts: readonly Uint8Array[];
  /**
   * Bytes for every image the card's tree still references, already resolved
   * by the plugin. A renderer looks a node's `src` up here; it never resolves
   * one itself, and a `src` the plugin could not resolve is not in the tree.
   */
  readonly images: readonly CardImage[];
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
export const JPEG_CONTENT_TYPE = "image/jpeg";

/** The size every major scraper expects. */
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

// The URL carries the output format in its extension, so a CDN keyed on
// extension behaves and the link is self-describing. A content type with no
// entry has no servable URL, which is the check the route makes.
const EXTENSIONS = new Map<string, string>([
  [SVG_CONTENT_TYPE, "svg"],
  [PNG_CONTENT_TYPE, "png"],
  [JPEG_CONTENT_TYPE, "jpg"],
  ["image/webp", "webp"],
]);

export function extensionFor(contentType: string): string | undefined {
  return EXTENSIONS.get(contentType);
}

// What every major scraper renders. X takes PNG, JPEG, WebP and GIF; Facebook
// and LinkedIn document PNG, JPEG and GIF — and the plugin's own engine emits
// the first two. The exclusion that matters is SVG: it is a document rather
// than a raster, and an SVG `og:image` unfurls as nothing at all, which is
// strictly worse than the site's generic default.
const SCRAPER_SAFE = new Set([PNG_CONTENT_TYPE, JPEG_CONTENT_TYPE]);

/**
 * The extension a card in this format is advertised under, or undefined when
 * scrapers do not render it. Such a format still gets its route — a developer
 * with no rasterizer can look at their cards — but the head falls through to
 * the site-wide default.
 */
export function advertisedExtension(contentType: string): string | undefined {
  return SCRAPER_SAFE.has(contentType)
    ? EXTENSIONS.get(contentType)
    : undefined;
}

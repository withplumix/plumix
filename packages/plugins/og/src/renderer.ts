/** Plain JSON, so an off-box renderer can receive it over the wire. */
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
 * `src` is a key into {@link CardRenderInput.images}, never fetched by the
 * renderer.
 */
export interface CardImageNode {
  readonly type: "image";
  readonly className?: string;
  readonly src: string;
  readonly width?: number;
  readonly height?: number;
}

/**
 * One resolved image: the `src` a node names it by, and the bytes behind it.
 */
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
  /** An unresolvable `src` has already been removed from the tree. */
  readonly images: readonly CardImage[];
  /**
   * The request's traced `fetch`. Passed in rather than reached for globally so
   * a renderer that calls out — the remote one — lands in the request waterfall
   * like every other outbound call.
   */
  readonly fetch: typeof globalThis.fetch;
}

export const FONT_FORMATS = ["ttf", "otf", "woff", "woff2"] as const;

/** Named by file extension. */
export type FontFormat = (typeof FONT_FORMATS)[number];

/** The formats a renderer parses, declared so the plugin hands it no other. */
export interface CardFontSupport {
  readonly formats: readonly FontFormat[];
}

/**
 * Also the default for a renderer that declares nothing. Import this rather
 * than the engine module, which would pull its wasm onto the static graph.
 */
export const BUNDLED_ENGINE_FONTS: CardFontSupport = {
  formats: ["ttf", "otf", "woff"],
};

export interface CardRenderer {
  /**
   * What {@link CardRenderer.render} produces. Declared up front because the
   * route has to name the type — in the URL's extension and in the served
   * headers — before any render has happened.
   */
  readonly contentType: string;
  /**
   * Defaults to {@link BUNDLED_ENGINE_FONTS}. `false` or an empty list reads no
   * fonts, so a runtime without an asset layer never fetches any.
   */
  readonly fonts?: CardFontSupport | false;
  render(node: CardNode, input: CardRenderInput): Promise<Uint8Array>;
}

export const SVG_CONTENT_TYPE = "image/svg+xml";
export const PNG_CONTENT_TYPE = "image/png";
export const JPEG_CONTENT_TYPE = "image/jpeg";

/** The size every major scraper expects. */
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

/** A content type with no extension here has no servable URL. */
const EXTENSIONS = new Map<string, string>([
  [SVG_CONTENT_TYPE, "svg"],
  [PNG_CONTENT_TYPE, "png"],
  [JPEG_CONTENT_TYPE, "jpg"],
  ["image/webp", "webp"],
]);

export function extensionFor(contentType: string): string | undefined {
  return EXTENSIONS.get(contentType);
}

/**
 * What X, Facebook and LinkedIn all render. An SVG `og:image` unfurls as
 * nothing, worse than the site default.
 */
const SCRAPER_SAFE = new Set([PNG_CONTENT_TYPE, JPEG_CONTENT_TYPE]);

/** Undefined when scrapers don't render the format; its route still serves. */
export function advertisedExtension(contentType: string): string | undefined {
  return SCRAPER_SAFE.has(contentType)
    ? EXTENSIONS.get(contentType)
    : undefined;
}

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

/**
 * Every font container a path can name. One roster, with the type read off it,
 * so a format cannot be added to the union and forgotten where paths are
 * matched against it.
 */
export const FONT_FORMATS = ["ttf", "otf", "woff", "woff2"] as const;

/**
 * A font container, named by the extension the file is stored under. Which of
 * these a renderer can parse is a property of that renderer and of nothing
 * else: the bundled engine reads all but WOFF2 — what most font packages ship
 * — and an endpoint on the other side of {@link CardRenderer} may read exactly
 * the one the engine here cannot.
 */
export type FontFormat = (typeof FONT_FORMATS)[number];

/** The formats a renderer parses, declared so the plugin hands it no other. */
export interface CardFontSupport {
  readonly formats: readonly FontFormat[];
}

/**
 * What the bundled engine parses, and so what a renderer that declares nothing
 * is taken to read — the default exists because this engine's formats are what
 * every renderer was assumed to read before the declaration did.
 *
 * Exported for a renderer that wants to say "I read what the bundled engine
 * reads" without importing the engine's own module, which would put its wasm
 * on the static graph of everything that merely installs the plugin.
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
   * What this renderer *reads*, beside the type above that says what it
   * writes. `false` is a renderer that reads no fonts at all — one rendering
   * off-box, whose endpoint brings its own — and declaring it is what stops
   * the plugin reading a font set nothing will look at, and what stops a
   * runtime with no asset layer failing a card that never needed one.
   *
   * Left out, the renderer reads {@link BUNDLED_ENGINE_FONTS}, so a renderer
   * written before this existed behaves exactly as it did. An empty format
   * list means the same as `false`: a renderer that reads nothing.
   *
   * The plugin hands over only the configured faces in these formats, and the
   * card's digest names that same filtered set — a face a renderer cannot
   * parse is not an input to the bytes it produces.
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

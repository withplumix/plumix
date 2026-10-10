import type { CardFontSupport, CardImage, CardRenderer } from "./renderer.js";
import { toBase64 } from "./base64.js";
import { OgPluginError } from "./errors.js";
import { PNG_CONTENT_TYPE } from "./renderer.js";

export interface RemoteRendererOptions {
  /** Endpoint the node tree is POSTed to as JSON. */
  readonly url: string;
  /** What the endpoint answers with. Defaults to PNG. */
  readonly contentType?: string;
  /**
   * Opt-in: faces travel base64 per render, several hundred KB each and several
   * MB for a CJK face. Left out, no font is sent.
   */
  readonly fonts?: CardFontSupport;
}

/**
 * Images travel resolved as base64; the endpoint brings its own fonts unless
 * `fonts` is set.
 */
export function remote(options: RemoteRendererOptions): CardRenderer {
  const contentType = options.contentType ?? PNG_CONTENT_TYPE;
  // An endpoint declaring no format reads nothing, which is what `false`
  // already spells — normalised here so the declaration and the wire below
  // cannot answer the same question differently.
  const fonts =
    options.fonts === undefined || options.fonts.formats.length === 0
      ? false
      : options.fonts;

  return {
    contentType,
    fonts,
    render: async (node, input) => {
      const response = await input.fetch(options.url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: contentType },
        body: JSON.stringify({
          node,
          width: input.width,
          height: input.height,
          stylesheets: input.stylesheets,
          images: input.images.map(encodeImage),
          // Present-but-empty ("asked, site has none") must differ from absent
          // ("never asked").
          ...(fonts === false ? {} : { fonts: input.fonts.map(toBase64) }),
        }),
      });
      if (!response.ok) {
        throw OgPluginError.remoteRendererRefused({
          url: options.url,
          status: response.status,
        });
      }
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

function encodeImage(image: CardImage): { src: string; data: string } {
  return { src: image.src, data: toBase64(image.data) };
}

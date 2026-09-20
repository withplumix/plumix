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
   * Font formats the endpoint parses, when it wants the site's faces rather
   * than its own. Left out, no font is read or sent — the default, and the
   * reason for moving a render off-box in the first place.
   *
   * Faces travel base64 in the payload, like the images beside them, so they
   * cost several hundred KB each per render and several MB for a CJK face.
   * That is the whole bill for this option, and it is why it is opt-in.
   */
  readonly fonts?: CardFontSupport;
}

/**
 * Render off-box. The node tree, the size, the stylesheets and the images go
 * over the wire as JSON and the bytes come back; the endpoint brings its own
 * fonts by default, since posting a font set per card would undo the reason
 * for moving rendering off the Worker in the first place. An endpoint that
 * would rather render in the site's own faces says so with `fonts`.
 *
 * Images travel resolved, base64 in the payload: an endpoint handed a bare
 * `src` would have to fetch it, putting back what this plugin removes.
 *
 * The only shipped renderer that leaves the bundled engine unexecuted — see
 * `renderer` on the plugin's options for what that does and does not save.
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
          // Keyed on the same declaration above, not on how many faces
          // arrived: present-but-empty is "you asked and the site configured
          // none", absent is "you never asked". An endpoint that renders a
          // fallback face in the first case needs to tell them apart.
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

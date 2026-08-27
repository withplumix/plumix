import type { CardImage, CardRenderer } from "./renderer.js";
import { toBase64 } from "./base64.js";
import { OgPluginError } from "./errors.js";
import { PNG_CONTENT_TYPE } from "./renderer.js";

export interface RemoteRendererOptions {
  /** Endpoint the node tree is POSTed to as JSON. */
  readonly url: string;
  /** What the endpoint answers with. Defaults to PNG. */
  readonly contentType?: string;
}

/**
 * Render off-box. The node tree, the size, the stylesheets and the images go
 * over the wire as JSON and the bytes come back; the endpoint brings its own
 * fonts, since posting a font set per card would undo the reason for moving
 * rendering off the Worker in the first place.
 *
 * Images travel resolved, base64 in the payload: an endpoint handed a bare
 * `src` would have to fetch it, putting back what this plugin removes.
 *
 * The only shipped renderer that leaves the bundled engine unexecuted — see
 * `renderer` on the plugin's options for what that does and does not save.
 */
export function remote(options: RemoteRendererOptions): CardRenderer {
  const contentType = options.contentType ?? PNG_CONTENT_TYPE;

  return {
    contentType,
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

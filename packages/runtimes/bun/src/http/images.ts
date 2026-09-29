import type { AssetsBinding, ImageDelivery } from "plumix";
import type {
  ImageFormat,
  ImageParams,
  NegotiatedFormat,
} from "plumix/runtime";
import {
  etagMatches,
  fetchRemoteImageSource,
  IMAGE_ROUTE,
  IMAGE_SOURCE_HEADERS,
  imageSourceKey,
  isPermittedImageSource,
  isSameHostImageSource,
  negotiateImageFormat,
  parseImageParams,
  readImageSource,
} from "plumix/runtime";
import { normalizeBasePath, withBasePath } from "plumix/support";

import type { BunImageDelivery } from "../images.js";
import { ImagesError } from "../errors.js";
import { encodeAs, isBunImages } from "../images.js";

export interface ImageLayerOptions {
  /**
   * Resolves a same-origin source in-process: the site's own `fetch`, as an
   * anonymous GET carrying the visitor's address, so the media plugin's
   * gating applies and nothing crosses the network.
   */
  readonly fetch: (
    request: Request,
    clientAddress: string | undefined,
  ) => Response | Promise<Response>;
  /** Consulted first, so a file the process serves from disk is a source too. */
  readonly assets?: AssetsBinding;
  /** Raw, as the user wrote it in `plumix.config.ts`; normalized as core does. */
  readonly basePath?: string;
}

export interface ImageLayer {
  /**
   * The serve path's pre-handler layer: a GET or HEAD of the route answered,
   * `null` for everything the handler answers instead. `request` carries the
   * URL the trust rules decided.
   */
  readonly serve: (
    request: Request,
    clientAddress?: string,
  ) => Promise<Response | null>;
}

/** Every variant is named by its URL, and its format follows `Accept`. */
const CACHED_HEADERS = {
  "cache-control": "public, max-age=31536000, immutable",
  vary: "accept",
};

type OutputFormat = ImageFormat | "png";
const CONTENT_TYPES: Readonly<Record<OutputFormat, string>> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

interface VariantRequest {
  readonly params: ImageParams;
  readonly format: NegotiatedFormat;
  readonly source: string;
  readonly key: string;
  readonly url: URL;
  readonly clientAddress: string | undefined;
}

interface Variant {
  readonly format: OutputFormat;
  /** Freshly rendered, or the cache file. */
  readonly body: Blob;
}

// What a source-typed variant may be stored as, looked up in this order.
const candidates = (format: NegotiatedFormat): readonly OutputFormat[] =>
  format === "source" ? ["jpeg", "png", "webp", "avif"] : [format];

// A decoded input onto what the host can encode; `Bun.Image` decodes GIF,
// BMP and TIFF but encodes none of them, so those come out lossless.
function ownFormat(
  decoded: Bun.Image.Format,
  encodable: readonly ImageFormat[],
): OutputFormat {
  if (decoded === "png") return "png";
  return encodable.find((format) => format === decoded) ?? "png";
}

function variantKey(params: ImageParams, format: NegotiatedFormat): string {
  const { src, width, height, fit, quality } = params;
  return new Bun.CryptoHasher("sha256")
    .update(JSON.stringify([src, width, height, fit, quality, format]))
    .digest("hex")
    .slice(0, 40);
}

/**
 * The size a source renders at, or `null` to leave it as it is. Never larger
 * than the source. `Bun.Image` has no crop, so `cover` scales to cover the
 * box whole and leaves the overflow to the page's `object-fit`.
 */
function targetSize(
  source: { readonly width: number; readonly height: number },
  { width, height, fit }: ImageParams,
): { readonly width: number; readonly height: number } | null {
  const ratios = [
    ...(width === undefined ? [] : [width / source.width]),
    ...(height === undefined ? [] : [height / source.height]),
  ];
  if (ratios.length === 0) return null;
  const covering = fit === undefined || fit === "cover";
  const scale = Math.min(
    1,
    covering ? Math.max(...ratios) : Math.min(...ratios),
  );
  if (scale === 1) return null;
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
}

/**
 * The route served in front of the handler. A variant is named by a hash of
 * the request, so a hit is answered from disk with no source fetch, and the
 * `ETag` is that hash: `If-None-Match` is decided from the disk before
 * anything is rendered.
 */
export function createImageLayer(
  slot: ImageDelivery | undefined,
  options: ImageLayerOptions,
): ImageLayer {
  if (!isBunImages(slot)) return { serve: () => Promise.resolve(null) };
  return { serve: serveWith(slot, options) };
}

function serveWith(
  slot: BunImageDelivery,
  options: ImageLayerOptions,
): ImageLayer["serve"] {
  const { cache } = slot;
  const pending = new Map<string, Promise<Variant>>();
  const route = withBasePath(IMAGE_ROUTE, normalizeBasePath(options.basePath));
  const sourceRules = { remotePatterns: slot.config.remotePatterns, route };

  async function bounded(response: Response): Promise<Uint8Array> {
    const bytes = await readImageSource(response);
    if (bytes === null) throw ImagesError.upstream({ status: 413 });
    return bytes;
  }

  async function resolveSameOrigin({
    params,
    url,
    clientAddress,
  }: VariantRequest): Promise<Uint8Array> {
    const target = new URL(params.src, url);
    if (target.pathname === route) throw ImagesError.upstream({ status: 400 });
    const request = new Request(target, { headers: IMAGE_SOURCE_HEADERS });
    let response = await options.assets?.fetch(request);
    if (response === undefined || response.status === 404) {
      response = await options.fetch(request, clientAddress);
    }
    if (!response.ok) throw ImagesError.upstream({ status: response.status });
    return bounded(response);
  }

  async function resolveRemote(src: string): Promise<Uint8Array> {
    const source = await fetchRemoteImageSource(src, sourceRules);
    if (!source.ok) throw ImagesError.upstream({ status: source.status });
    return bounded(source.response);
  }

  async function render(request: VariantRequest): Promise<Variant> {
    const { params, format, source, key, url } = request;
    const epoch = cache.epoch(source);
    const bytes = isSameHostImageSource(params.src, url.host)
      ? await resolveSameOrigin(request)
      : await resolveRemote(params.src);
    let output: OutputFormat;
    let rendered: Blob;
    try {
      const meta = await new Bun.Image(bytes).metadata();
      output =
        format === "source"
          ? ownFormat(meta.format, await slot.encodable())
          : format;
      // A fresh instance for the variant: `resize` mutates the one it is
      // called on.
      const image = new Bun.Image(bytes);
      const size = targetSize(meta, params);
      if (size !== null) image.resize(size.width, size.height);
      rendered = await encodeAs(image, output, params.quality).blob();
    } catch {
      // A source `Bun.Image` cannot decode, whether it says so up front or
      // once the bytes run out.
      throw ImagesError.upstream({ status: 415 });
    }
    await cache.put(source, key, output, rendered, epoch);
    return { format: output, body: rendered };
  }

  async function variant(request: VariantRequest): Promise<Variant> {
    const hit = await cache.find(
      request.source,
      request.key,
      candidates(request.format),
    );
    if (hit !== null) return { format: hit.extension, body: hit.file };
    let inflight = pending.get(request.key);
    if (!inflight) {
      inflight = render(request).finally(() => pending.delete(request.key));
      pending.set(request.key, inflight);
    }
    return inflight;
  }

  async function handle(
    request: Request,
    url: URL,
    clientAddress: string | undefined,
  ): Promise<Response> {
    const params = parseImageParams(slot.config.widths, url.searchParams);
    // The roster is checked ahead of the cache: what the config refuses now
    // is refused whether or not an earlier config rendered it.
    if (
      params === null ||
      !(
        isSameHostImageSource(params.src, url.host) ||
        isPermittedImageSource(params.src, sourceRules)
      )
    ) {
      return new Response("Bad Request", { status: 400 });
    }
    const format = negotiateImageFormat(
      params.format,
      request.headers.get("accept"),
      await slot.encodable(),
    );
    const source = imageSourceKey(params.src, url);
    const key = variantKey(params, format);
    const etag = `"${key}"`;
    const ifNoneMatch = request.headers.get("if-none-match");
    try {
      // A revalidation is answered from the disk alone, so a purged variant
      // meets its source again rather than being confirmed from its hash.
      if (
        ifNoneMatch !== null &&
        etagMatches(ifNoneMatch, etag) &&
        (await cache.find(source, key, candidates(format))) !== null
      ) {
        return new Response(null, {
          status: 304,
          headers: { ...CACHED_HEADERS, etag },
        });
      }
      const { format: output, body } = await variant({
        params,
        format,
        source,
        key,
        url,
        clientAddress,
      });
      const headers = {
        ...CACHED_HEADERS,
        "content-type": CONTENT_TYPES[output],
        "content-length": String(body.size),
        etag,
      };
      return new Response(request.method === "HEAD" ? null : body, {
        headers,
      });
    } catch (error) {
      // A source that gave no bytes answers with its own status.
      if (error instanceof ImagesError) {
        return new Response(null, { status: error.status });
      }
      return new Response("Internal Server Error", { status: 500 });
    }
  }

  return async (request, clientAddress) => {
    if (request.method !== "GET" && request.method !== "HEAD") return null;
    const url = new URL(request.url);
    if (url.pathname !== route) return null;
    return handle(request, url, clientAddress);
  };
}

import { createHash } from "node:crypto";
import { availableParallelism } from "node:os";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AssetsBinding, ImageDelivery } from "plumix";
import type {
  ImageFormat,
  ImageParams,
  NegotiatedFormat,
  TrustedRequest,
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

import type { CachedVariant } from "../image-cache.js";
import type { NodeImageDelivery } from "../images.js";
import type { BridgeOptions } from "./bridge.js";
import { ImagesError } from "../errors.js";
import { isNodeImages } from "../images.js";
import { trustedRequest, writeResponse } from "./bridge.js";

export interface ImageLayerOptions extends Pick<BridgeOptions, "trustProxy"> {
  /**
   * Resolves a same-origin source in-process: the site's own `fetch`, as an
   * anonymous GET carrying the visitor's address, so the media plugin's
   * gating applies and nothing crosses the network.
   */
  readonly fetch: (
    request: Request,
    meta: { readonly clientAddress?: string },
  ) => Response | Promise<Response>;
  /**
   * Consulted first, so a file the process serves from disk is a source too.
   */
  readonly assets?: AssetsBinding;
  /**
   * Raw from `plumix.config.ts`; normalized here as core does, so the route
   * matches wherever `url()` points.
   */
  readonly basePath?: string;
}

export interface ImageLayer {
  /**
   * Connect-style middleware for the entry's pre-handler layer: answers a
   * GET or HEAD of {@link IMAGE_ROUTE} and hands everything else to `next`.
   */
  readonly serve: (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => void;
}

const CACHED_HEADERS = {
  "cache-control": "public, max-age=31536000, immutable",
  vary: "accept",
};

const CONTENT_TYPES = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
} as const;
type OutputFormat = keyof typeof CONTENT_TYPES;
const OUTPUT_FORMATS = Object.keys(CONTENT_TYPES) as readonly OutputFormat[];

const ENCODABLE: readonly ImageFormat[] = ["jpeg", "webp", "avif"];

// The hash is both the cache file name and the `ETag`.
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
  readonly body: Buffer | CachedVariant;
}

const refused = (): ImagesError => ImagesError.upstream({ status: 400 });

type Render = (request: VariantRequest) => Promise<Variant>;

// Concurrent renders, each holding a source and its decoded pixels, are what
// bound process memory.
function limited(max: number, render: Render): Render {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async (request) => {
    if (active >= max) await new Promise<void>((next) => waiting.push(next));
    active += 1;
    try {
      return await render(request);
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}

const candidates = (format: NegotiatedFormat): readonly OutputFormat[] =>
  format === "source" ? OUTPUT_FORMATS : [format];

// What sharp names a decoded input, onto what it can encode. Vector and
// exotic raster inputs come out lossless.
function ownFormat(format: string | undefined): OutputFormat {
  if (format === "heif") return "avif";
  return (OUTPUT_FORMATS as readonly string[]).includes(format ?? "")
    ? (format as OutputFormat)
    : "png";
}

function variantKey(params: ImageParams, format: NegotiatedFormat): string {
  const { src, width, height, fit, quality } = params;
  return createHash("sha256")
    .update(JSON.stringify([src, width, height, fit, quality, format]))
    .digest("hex")
    .slice(0, 40);
}

async function readBounded(response: Response): Promise<Uint8Array> {
  const bytes = await readImageSource(response);
  if (bytes === null) throw ImagesError.upstream({ status: 413 });
  return bytes;
}

/**
 * The `ETag` is the request hash, so `If-None-Match` is decided from the cache
 * index before any read.
 */
export function createImageLayer(
  slot: ImageDelivery | undefined,
  options: ImageLayerOptions,
): ImageLayer {
  if (!isNodeImages(slot)) return { serve: (_req, _res, next) => next() };
  return { serve: serveWith(slot, options) };
}

function serveWith(
  slot: NodeImageDelivery,
  options: ImageLayerOptions,
): ImageLayer["serve"] {
  const { remotePatterns } = slot.config;
  const { cache } = slot;
  const pending = new Map<string, Promise<Variant>>();
  // Matches wherever `url()` points a same-site source: both sides prefix
  // the same normalized base.
  const route = withBasePath(IMAGE_ROUTE, normalizeBasePath(options.basePath));

  async function resolveSameOrigin({
    params,
    url,
    clientAddress: address,
  }: VariantRequest): Promise<Uint8Array> {
    const target = new URL(params.src, url);
    if (target.pathname === route) throw refused();
    const request = new Request(target, { headers: IMAGE_SOURCE_HEADERS });
    let response = await options.assets?.fetch(request);
    if (response === undefined || response.status === 404) {
      response = await options.fetch(request, { clientAddress: address });
    }
    if (!response.ok) throw ImagesError.upstream({ status: response.status });
    return readBounded(response);
  }

  const sourceRules = { remotePatterns, route };

  async function resolveRemote(src: string): Promise<Uint8Array> {
    const source = await fetchRemoteImageSource(src, sourceRules);
    if (!source.ok) throw ImagesError.upstream({ status: source.status });
    return readBounded(source.response);
  }

  const render = limited(availableParallelism(), renderVariant);

  async function renderVariant(request: VariantRequest): Promise<Variant> {
    const { params, format, source, key, url } = request;
    const epoch = cache.epoch(source);
    const bytes = isSameHostImageSource(params.src, url.host)
      ? await resolveSameOrigin(request)
      : await resolveRemote(params.src);
    const sharp = slot.sharp();
    let output: OutputFormat;
    let rendered: Buffer;
    try {
      // Animated by default: a GIF or WebP source keeps its frames through
      // the resize/re-encode instead of decoding to its first one.
      const decoded = (await sharp(bytes, { animated: true }).metadata())
        .format;
      output = format === "source" ? ownFormat(decoded) : format;
      let pipeline = sharp(bytes, { animated: true }).rotate();
      if (params.width !== undefined || params.height !== undefined) {
        pipeline = pipeline.resize({
          width: params.width,
          height: params.height,
          // `contain` is "fit within" on the slot contract; sharp's pads.
          fit:
            params.fit === undefined || params.fit === "cover"
              ? "cover"
              : "inside",
          withoutEnlargement: true,
        });
      }
      const lossy = output === "jpeg" || output === "webp" || output === "avif";
      rendered = await pipeline
        .toFormat(output, lossy ? { quality: params.quality } : {})
        .toBuffer();
    } catch {
      // A source `sharp` cannot decode, whether it says so up front or once
      // the bytes run out.
      throw ImagesError.upstream({ status: 415 });
    }

    await cache.put(source, key, output, rendered, epoch);
    return { format: output, body: rendered };
  }

  async function cached({
    source,
    key,
    format,
  }: VariantRequest): Promise<Variant | null> {
    const hit = await cache.open(source, key, candidates(format));
    return hit && { format: hit.extension, body: hit.body };
  }

  async function variant(request: VariantRequest): Promise<Variant> {
    const { key } = request;
    const hit = await cached(request);
    if (hit) return hit;
    let inflight = pending.get(key);
    if (!inflight) {
      inflight = render(request).finally(() => pending.delete(key));
      pending.set(key, inflight);
    }
    return inflight;
  }

  function respond(
    variant: Variant,
    etag: string,
    method: string | undefined,
  ): Response {
    const { body } = variant;
    const headers = {
      ...CACHED_HEADERS,
      "content-type": CONTENT_TYPES[variant.format],
      "content-length": String(
        Buffer.isBuffer(body) ? body.byteLength : body.size,
      ),
      etag,
    };
    if (method === "HEAD") {
      if (!Buffer.isBuffer(body)) body.stream.destroy();
      return new Response(null, { headers });
    }
    // Node types its web streams apart from the global ones; same objects.
    return new Response(
      Buffer.isBuffer(body)
        ? new Uint8Array(body)
        : (Readable.toWeb(body.stream) as ReadableStream),
      { headers },
    );
  }

  async function handle(
    req: IncomingMessage,
    { url, clientAddress }: TrustedRequest,
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
      req.headers.accept,
      ENCODABLE,
    );
    const source = imageSourceKey(params.src, url);
    const key = variantKey(params, format);
    const etag = `"${key}"`;
    const ifNoneMatch = req.headers["if-none-match"];
    try {
      // A revalidation is answered from the index alone, so a purged variant
      // meets its source again rather than being confirmed from its hash.
      if (
        ifNoneMatch !== undefined &&
        etagMatches(ifNoneMatch, etag) &&
        (await cache.touch(source, key, candidates(format)))
      ) {
        return new Response(null, {
          status: 304,
          headers: { ...CACHED_HEADERS, etag },
        });
      }
      const rendered = await variant({
        params,
        format,
        source,
        key,
        url,
        clientAddress,
      });
      return respond(rendered, etag, req.method);
    } catch (error) {
      if (!(error instanceof ImagesError)) {
        return new Response("Internal Server Error", { status: 500 });
      }
      // A source that gave no bytes answers with its own status; the
      // transformer itself being unusable (no `sharp`) is the site's fault.
      return error.code === "upstream"
        ? new Response(null, { status: error.status })
        : new Response(error.message, { status: 500 });
    }
  }

  return (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    let trusted: TrustedRequest;
    try {
      trusted = trustedRequest(req, options);
    } catch {
      next();
      return;
    }
    if (trusted.url.pathname !== route) {
      next();
      return;
    }
    void handle(req, trusted)
      .then((response) => writeResponse(response, req, res))
      .catch(() => res.destroy());
  };
}

import { createHash } from "node:crypto";
import { availableParallelism } from "node:os";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AssetsBinding, ImageDelivery } from "plumix";
import { matchesRemotePattern } from "plumix/blocks/renderer";

import type { CachedVariant } from "../image-cache.js";
import type { ImageFormat, ImageParams, NodeImageDelivery } from "../images.js";
import type { BridgeOptions } from "./bridge.js";
import { ImagesError } from "../errors.js";
import {
  IMAGE_ROUTE,
  isNodeImages,
  parseImageParams,
  sourceKey,
} from "../images.js";
import { clientAddress, requestUrl, writeResponse } from "./bridge.js";

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
  /** Consulted first, so a file the process serves from disk is a source too. */
  readonly assets?: AssetsBinding;
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

const MAX_HOPS = 10;
/** A source larger than this is not a picture a page would show. */
const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const REMOTE_TIMEOUT_MS = 15_000;
const SOURCE_HEADERS = { accept: "image/*,*/*;q=0.8" };
/** Every variant is content-addressed by its URL, and its format follows `Accept`. */
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

/** What a request asks for before the source is seen: a format, or the source's own. */
type FormatClass = ImageFormat | "source";

/** One request's transform, named: the hash is both the cache file and the `ETag`. */
interface VariantRequest {
  readonly params: ImageParams;
  readonly format: FormatClass;
  /** What a purge names: the source without its query, a same-host one by path. */
  readonly source: string;
  readonly key: string;
  /** The request as the bridge would see it; a same-origin source resolves against it. */
  readonly url: URL;
  readonly clientAddress: string | undefined;
}

interface Variant {
  readonly format: OutputFormat;
  /** Fresh bytes, or the cache file already open. */
  readonly body: Buffer | CachedVariant;
}

const refused = (): ImagesError => ImagesError.upstream({ status: 400 });

type Render = (request: VariantRequest) => Promise<Variant>;

/**
 * At most `max` renders run at once; the rest wait in order. A render holds
 * a source of up to {@link MAX_SOURCE_BYTES} and its decoded pixels, so how
 * many run together is what bounds the process's memory.
 */
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

const candidates = (format: FormatClass): readonly OutputFormat[] =>
  format === "source" ? OUTPUT_FORMATS : [format];

function negotiate(
  explicit: ImageFormat | undefined,
  accept: string | undefined,
): FormatClass {
  if (explicit) return explicit;
  if (accept?.includes("image/avif")) return "avif";
  if (accept?.includes("image/webp")) return "webp";
  return "source";
}

// What sharp names a decoded input, onto what it can encode. Vector and
// exotic raster inputs come out lossless.
function ownFormat(format: string | undefined): OutputFormat {
  if (format === "heif") return "avif";
  return (OUTPUT_FORMATS as readonly string[]).includes(format ?? "")
    ? (format as OutputFormat)
    : "png";
}

function variantKey(params: ImageParams, format: FormatClass): string {
  const { src, width, height, fit, quality } = params;
  return createHash("sha256")
    .update(JSON.stringify([src, width, height, fit, quality, format]))
    .digest("hex")
    .slice(0, 40);
}

function etagMatches(ifNoneMatch: string, etag: string): boolean {
  return ifNoneMatch
    .split(",")
    .map((s) => s.trim().replace(/^W\//, ""))
    .some((s) => s === "*" || s === etag);
}

// By host, not origin: behind a TLS-terminating proxy the process sees `http`
// while an absolute URL of its own site says `https`.
function isSameHost(src: string, host: string): boolean {
  if (src.startsWith("/")) return !src.startsWith("//");
  return URL.parse(src)?.host === host;
}

/** The body, bounded: a source past the cap is refused before it is held. */
async function readBounded(response: Response): Promise<Buffer> {
  if (Number(response.headers.get("content-length")) > MAX_SOURCE_BYTES) {
    await response.body?.cancel();
    throw ImagesError.upstream({ status: 413 });
  }
  const chunks: Uint8Array[] = [];
  let received = 0;
  for await (const chunk of response.body ?? []) {
    received += chunk.byteLength;
    if (received > MAX_SOURCE_BYTES) {
      await response.body?.cancel();
      throw ImagesError.upstream({ status: 413 });
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * The route served in front of the handler. A variant is named by a hash of
 * the request, so a hit is answered from disk with no source fetch, and the
 * `ETag` is that hash: `If-None-Match` is decided from the cache's index
 * before anything is read.
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

  async function resolveSameOrigin({
    params,
    url,
    clientAddress: address,
  }: VariantRequest): Promise<Buffer> {
    const target = new URL(params.src, url);
    if (target.pathname === IMAGE_ROUTE) throw refused();
    const request = new Request(target, { headers: SOURCE_HEADERS });
    let response = await options.assets?.fetch(request);
    if (response === undefined || response.status === 404) {
      response = await options.fetch(request, { clientAddress: address });
    }
    if (!response.ok) throw ImagesError.upstream({ status: response.status });
    return readBounded(response);
  }

  function isPermittedSource(src: string): boolean {
    const url = URL.parse(src);
    return url !== null && isPermittedUrl(url);
  }

  // The route is not a source for itself on either branch: the handler behind
  // `fetch` does not hold it, but a self-fetch over the network would, and a
  // nested one at every level.
  function isPermittedUrl(url: URL): boolean {
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.pathname !== IMAGE_ROUTE &&
      matchesRemotePattern(url.href, remotePatterns)
    );
  }

  // Every hop is re-validated against the roster: a permitted host may not
  // hand the route a source it would have refused directly.
  async function resolveRemote(src: string): Promise<Buffer> {
    let url = new URL(src);
    for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
      if (!isPermittedUrl(url)) throw refused();
      let response: Response;
      try {
        response = await fetch(url, {
          redirect: "manual",
          headers: SOURCE_HEADERS,
          signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
        });
      } catch {
        throw ImagesError.upstream({ status: 502 });
      }
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel();
        const next = URL.parse(location, url);
        if (next === null) throw refused();
        url = next;
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw ImagesError.upstream({ status: 502 });
      }
      return readBounded(response);
    }
    throw refused();
  }

  const render = limited(availableParallelism(), renderVariant);

  async function renderVariant(request: VariantRequest): Promise<Variant> {
    const { params, format, source, key, url } = request;
    const epoch = cache.epoch(source);
    const bytes = isSameHost(params.src, url.host)
      ? await resolveSameOrigin(request)
      : await resolveRemote(params.src);
    const sharp = slot.sharp();
    let output: OutputFormat;
    let rendered: Buffer;
    try {
      const decoded = (await sharp(bytes).metadata()).format;
      output = format === "source" ? ownFormat(decoded) : format;
      let pipeline = sharp(bytes).rotate();
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

  async function handle(req: IncomingMessage, url: URL): Promise<Response> {
    const params = parseImageParams(slot.config, url.searchParams);
    // The roster is checked ahead of the cache: what the config refuses now
    // is refused whether or not an earlier config rendered it.
    if (
      params === null ||
      !(isSameHost(params.src, url.host) || isPermittedSource(params.src))
    ) {
      return new Response("Bad Request", { status: 400 });
    }
    const sameHost = isSameHost(params.src, url.host);
    const format = negotiate(params.format, req.headers.accept);
    // However the host is spelled, a same-host source is one source, and the
    // one the media plugin purges by path.
    const source = sameHost
      ? new URL(params.src, url).pathname
      : sourceKey(params.src);
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
        clientAddress: clientAddress(req, options),
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
    let url: URL;
    try {
      url = requestUrl(req, options);
    } catch {
      next();
      return;
    }
    if (url.pathname !== IMAGE_ROUTE) {
      next();
      return;
    }
    void handle(req, url)
      .then((response) => writeResponse(response, req, res))
      .catch(() => res.destroy());
  };
}

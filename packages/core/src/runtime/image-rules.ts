import type { RemotePattern } from "../blocks/renderer/image-attrs.js";
import type { TransformOpts } from "./contract/slots.js";
import { withBasePath } from "../base-path.js";
import { matchesRemotePattern } from "../blocks/renderer/image-attrs.js";

/**
 * Where a self-hosted runtime answers transforms, under the site's base path.
 */
export const IMAGE_ROUTE = "/_plumix/image";

export type ImageFormat = Exclude<NonNullable<TransformOpts["format"]>, "auto">;
export type ImageFit = NonNullable<TransformOpts["fit"]>;

/** What the route transforms: the source and its snapped, clamped options. */
export interface ImageParams {
  readonly src: string;
  readonly width?: number;
  readonly height?: number;
  readonly fit?: ImageFit;
  readonly quality?: number;
  readonly format?: ImageFormat;
}

/** What `url()` needs to point a source at the route. */
export interface ImageUrlRules {
  /** Ascending. */
  readonly widths: readonly number[];
  readonly remotePatterns: readonly RemotePattern[];
  /** Normalized, as core hands it to `connect`. */
  readonly basePath: string;
}

const FORMATS: readonly ImageFormat[] = ["jpeg", "webp", "avif"];
const FITS: readonly ImageFit[] = ["cover", "contain", "scale-down"];

/** The smallest roster width at or above `width`, or the largest of them. */
export function snapWidth(widths: readonly number[], width: number): number {
  return widths.find((w) => w >= width) ?? Math.max(...widths);
}

export function clampQuality(quality: number): number {
  return Math.min(100, Math.max(1, Math.round(quality)));
}

/**
 * A crop's height scales with the width to keep its aspect; a bare height is
 * capped by the roster ceiling, bounding pixels per request.
 */
function normalize(
  widths: readonly number[],
  opts: Omit<ImageParams, "src"> & { readonly dpr?: number },
): Omit<ImageParams, "src"> {
  const dpr = opts.dpr ?? 1;
  const out: {
    width?: number;
    height?: number;
    fit?: ImageFit;
    quality?: number;
    format?: ImageFormat;
  } = {};
  if (opts.width !== undefined) {
    const asked = Math.max(1, Math.round(opts.width * dpr));
    out.width = snapWidth(widths, asked);
    if (opts.height !== undefined) {
      out.height = Math.max(
        1,
        Math.round((opts.height * dpr * out.width) / asked),
      );
    }
  } else if (opts.height !== undefined) {
    out.height = Math.max(1, Math.round(opts.height * dpr));
  }
  if (out.height !== undefined) {
    out.height = Math.min(out.height, Math.max(...widths));
  }
  if (opts.fit !== undefined) out.fit = opts.fit;
  if (opts.quality !== undefined) out.quality = clampQuality(opts.quality);
  if (opts.format !== undefined) out.format = opts.format;
  return out;
}

function integer(raw: string | null): number | null | undefined {
  if (raw === null) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

function oneOf<T extends string>(
  raw: string | null,
  allowed: readonly T[],
): T | null | undefined {
  if (raw === null) return undefined;
  return allowed.find((value) => value === raw) ?? null;
}

/**
 * A hand-written URL is snapped and clamped like a roster one; anything
 * unparseable is `null`.
 */
export function parseImageParams(
  widths: readonly number[],
  query: URLSearchParams,
): ImageParams | null {
  const src = query.get("src");
  if (!src) return null;
  const width = integer(query.get("w"));
  const height = integer(query.get("h"));
  const quality = integer(query.get("q"));
  const format = oneOf(query.get("f"), FORMATS);
  const fit = oneOf(query.get("fit"), FITS);
  if (
    width === null ||
    height === null ||
    quality === null ||
    format === null ||
    fit === null
  ) {
    return null;
  }
  return { src, ...normalize(widths, { width, height, fit, quality, format }) };
}

function isRemote(src: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//");
}

/**
 * A remote source no pattern allows, or one with no transform asked, is handed
 * back unchanged.
 */
export function imageTransformUrl(
  rules: ImageUrlRules,
  sourceUrl: string,
  opts?: TransformOpts,
): string {
  if (
    isRemote(sourceUrl) &&
    !matchesRemotePattern(sourceUrl, rules.remotePatterns)
  ) {
    return sourceUrl;
  }
  const transform = normalize(rules.widths, {
    ...opts,
    format: opts?.format === "auto" ? undefined : opts?.format,
  });
  const query = new URLSearchParams({ src: sourceUrl });
  if (transform.width !== undefined) query.set("w", String(transform.width));
  if (transform.height !== undefined) query.set("h", String(transform.height));
  if (transform.fit !== undefined) query.set("fit", transform.fit);
  if (transform.quality !== undefined)
    query.set("q", String(transform.quality));
  if (transform.format !== undefined) query.set("f", transform.format);
  return query.size === 1
    ? sourceUrl
    : `${withBasePath(IMAGE_ROUTE, rules.basePath)}?${query.toString()}`;
}

/**
 * What a request asks for before the source is seen: a format, or the source's
 * own.
 */
export type NegotiatedFormat = ImageFormat | "source";

/**
 * `encodable` varies by host (no AVIF on Linux under `Bun.Image`). A bare full
 * wildcard doesn't opt into a next-gen format; an exact range's `q=0` beats
 * `image/*`.
 */
export function negotiateImageFormat(
  explicit: ImageFormat | undefined,
  accept: string | null | undefined,
  encodable: readonly ImageFormat[],
): NegotiatedFormat {
  if (explicit !== undefined && encodable.includes(explicit)) return explicit;
  if (!accept) return "source";
  let wildcardQ: number | undefined;
  let avifQ: number | undefined;
  let webpQ: number | undefined;
  for (const range of accept.split(",")) {
    const [rawToken, ...params] = range.split(";");
    const token = rawToken?.trim().toLowerCase();
    if (token !== "image/avif" && token !== "image/webp" && token !== "image/*")
      continue;
    const rawQ = params
      .map((p) => p.trim())
      .find((p) => p.startsWith("q="))
      ?.slice(2);
    const parsed = rawQ === undefined ? 1 : Number(rawQ);
    const q = Number.isFinite(parsed) ? parsed : 1;
    if (token === "image/avif") avifQ = q;
    else if (token === "image/webp") webpQ = q;
    else wildcardQ = q;
  }
  if (encodable.includes("avif") && (avifQ ?? wildcardQ ?? 0) > 0) {
    return "avif";
  }
  if (encodable.includes("webp") && (webpQ ?? wildcardQ ?? 0) > 0) {
    return "webp";
  }
  return "source";
}

/** A base for parsing a relative source, on a host no real source can have. */
const RELATIVE_BASE = "http://plumix.invalid";

/**
 * By host, not origin: behind a TLS-terminating proxy the process sees `http`
 * while an absolute URL of its own site says `https`.
 */
export function isSameHostImageSource(src: string, host: string): boolean {
  if (src.startsWith("/")) return !src.startsWith("//");
  return URL.parse(src)?.host === host;
}

/**
 * Drops the query so every variant purges together. A source on `request`'s
 * host keys by path alone, as the media plugin purges.
 */
export function imageSourceKey(src: string, request?: URL): string {
  if (request !== undefined && isSameHostImageSource(src, request.host)) {
    return new URL(src, request).pathname;
  }
  const url = URL.parse(src, RELATIVE_BASE);
  if (url === null) return src;
  return url.origin === RELATIVE_BASE
    ? url.pathname
    : `${url.origin}${url.pathname}`;
}

/** Whether `If-None-Match` names `etag`, weak or strong, or is `*`. */
export function etagMatches(ifNoneMatch: string, etag: string): boolean {
  return ifNoneMatch
    .split(",")
    .map((s) => s.trim().replace(/^W\//, ""))
    .some((s) => s === "*" || s === etag);
}

const MAX_IMAGE_REDIRECTS = 10;
const REMOTE_TIMEOUT_MS = 15_000;
const MAX_IMAGE_SOURCE_BYTES = 32 * 1024 * 1024;
/** What a source is requested with, same-origin or remote. */
export const IMAGE_SOURCE_HEADERS = { accept: "image/*,*/*;q=0.8" };

export interface RemoteImageSourceOptions {
  readonly remotePatterns: readonly RemotePattern[];
  /** The route under the base path, which is never a source for itself. */
  readonly route: string;
  /** The global one by default. */
  readonly fetch?: typeof fetch;
}

/** A source's response, or the status the route answers in its place. */
export type ImageSourceResult =
  | { readonly ok: true; readonly response: Response }
  | { readonly ok: false; readonly status: number };

/**
 * The route is not a source for itself: the handler does not hold it, but a
 * self-fetch over the network would, and a nested one at every level.
 */
function isPermittedUrl(
  url: URL,
  { remotePatterns, route }: RemoteImageSourceOptions,
): boolean {
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    url.pathname !== route &&
    matchesRemotePattern(url.href, remotePatterns)
  );
}

/** Whether the route may fetch `src` from off the site at all. */
export function isPermittedImageSource(
  src: string,
  options: RemoteImageSourceOptions,
): boolean {
  const url = URL.parse(src);
  return url !== null && isPermittedUrl(url, options);
}

/**
 * Re-validates every redirect hop, so a permitted host can't hand over a source
 * that would be refused directly.
 */
export async function fetchRemoteImageSource(
  src: string,
  options: RemoteImageSourceOptions,
): Promise<ImageSourceResult> {
  const fetchSource = options.fetch ?? fetch;
  let url = URL.parse(src);
  for (let hop = 0; hop <= MAX_IMAGE_REDIRECTS; hop += 1) {
    if (url === null || !isPermittedUrl(url, options)) {
      return { ok: false, status: 400 };
    }
    let response: Response;
    try {
      response = await fetchSource(url, {
        redirect: "manual",
        headers: IMAGE_SOURCE_HEADERS,
        signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, status: 502 };
    }
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      url = URL.parse(location, url);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, status: 502 };
    }
    return { ok: true, response };
  }
  return { ok: false, status: 400 };
}

/**
 * A source's body, bounded: one past {@link MAX_IMAGE_SOURCE_BYTES} is
 * refused before it is held, and `null` says so.
 */
export async function readImageSource(
  response: Response,
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (Number(response.headers.get("content-length")) > MAX_IMAGE_SOURCE_BYTES) {
    await response.body?.cancel();
    return null;
  }
  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = response.body?.getReader();
  for (;;) {
    const next = await reader?.read();
    if (next === undefined || next.done) break;
    received += next.value.byteLength;
    if (received > MAX_IMAGE_SOURCE_BYTES) {
      await reader?.cancel();
      return null;
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

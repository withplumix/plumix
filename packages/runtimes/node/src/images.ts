import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { ImageDelivery, TransformOpts } from "plumix";
import type { RemotePattern } from "plumix/blocks/renderer";
import type SharpModule from "sharp";
import { matchesRemotePattern } from "plumix/blocks/renderer";

import { ImagesError } from "./errors.js";

/** Where the entry's pre-handler layer answers transforms. */
export const IMAGE_ROUTE = "/_plumix/image";

export type ImageFormat = Exclude<NonNullable<TransformOpts["format"]>, "auto">;
type ImageFit = NonNullable<TransformOpts["fit"]>;

export interface ImagesConfig {
  /**
   * The widths a variant may have; a request snaps up to the next entry and
   * past the largest takes it. Bounds what a visitor can make the process
   * render and cache.
   */
  readonly widths?: readonly number[];
  /**
   * Remote hosts the route will fetch, in the shape `images.remotePatterns`
   * takes for `<Image>`. Empty by default: a remote source is left
   * untransformed by `url()` and refused by the route.
   */
  readonly remotePatterns?: readonly RemotePattern[];
  /** Where rendered variants are kept; `.cache/plumix/images` by default. */
  readonly cacheDir?: string;
}

export interface ResolvedImagesConfig {
  /** Ascending, deduplicated. */
  readonly widths: readonly number[];
  readonly remotePatterns: readonly RemotePattern[];
  /** Absolute. */
  readonly cacheDir: string;
}

export interface NodeImageDelivery extends ImageDelivery {
  readonly kind: "node-images";
  readonly acceptsRelativeSources: true;
  readonly config: ResolvedImagesConfig;
  /** `sharp`, loaded on first use; `connect` is the first user. */
  sharp(): typeof SharpModule;
}

/** What the route transforms: the source and its snapped, clamped options. */
export interface ImageParams {
  readonly src: string;
  readonly width?: number;
  readonly height?: number;
  readonly fit?: ImageFit;
  readonly quality?: number;
  readonly format?: ImageFormat;
}

const DEFAULT_WIDTHS = [320, 640, 768, 1024, 1280, 1536, 1920];
const DEFAULT_CACHE_DIR = ".cache/plumix/images";
const FORMATS: readonly ImageFormat[] = ["jpeg", "webp", "avif"];
const FITS: readonly ImageFit[] = ["cover", "contain", "scale-down"];

function resolveConfig(config: ImagesConfig): ResolvedImagesConfig {
  const widths = [...new Set(config.widths ?? DEFAULT_WIDTHS)].sort(
    (a, b) => a - b,
  );
  if (
    widths.length === 0 ||
    widths.some((w) => !Number.isInteger(w) || w <= 0)
  ) {
    throw ImagesError.invalidWidths({ widths: config.widths ?? [] });
  }
  return {
    widths,
    remotePatterns: config.remotePatterns ?? [],
    cacheDir: resolve(config.cacheDir ?? DEFAULT_CACHE_DIR),
  };
}

/** The smallest roster width at or above `width`, or the largest of them. */
export function snapWidth(widths: readonly number[], width: number): number {
  return widths.find((w) => w >= width) ?? Math.max(...widths);
}

export function clampQuality(quality: number): number {
  return Math.min(100, Math.max(1, Math.round(quality)));
}

function isRemote(src: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//");
}

/**
 * Snap and clamp one transform. A crop's height scales with the width so the
 * snap keeps its aspect; a bare height is bounded by the roster's ceiling,
 * which is what bounds the pixels one request can ask for.
 */
function normalize(
  config: ResolvedImagesConfig,
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
    out.width = snapWidth(config.widths, asked);
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
    out.height = Math.min(out.height, Math.max(...config.widths));
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
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

/**
 * The route's reading of a query: `url()` writes roster values, but a
 * hand-written URL is snapped and clamped the same way (a width or quality
 * below range rises to the floor), and anything unparseable is `null` for
 * the route to answer 400.
 */
export function parseImageParams(
  config: ResolvedImagesConfig,
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
  return { src, ...normalize(config, { width, height, fit, quality, format }) };
}

const ownRequire = createRequire(import.meta.url);

/**
 * `sharp` is an optional peer: a site without images() must install nothing
 * native, so it is required here, on first use, and a missing package is
 * named rather than surfacing as a resolution error deep in a request.
 */
function loadSharp(): typeof SharpModule {
  let loaded: typeof SharpModule;
  try {
    loaded = ownRequire("sharp") as typeof SharpModule;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND") {
      throw ImagesError.sharpMissing({ cause: error });
    }
    throw error;
  }
  // libvips' operation cache is the one piece of shared mutable state under
  // concurrent transforms; the known race is avoided by not having it.
  loaded.cache(false);
  return loaded;
}

/**
 * The `imageDelivery` slot on Node: `url()` is URL math onto
 * {@link IMAGE_ROUTE}, which the entry's pre-handler layer serves through
 * `sharp`. A same-origin source is resolved through the site's own handler,
 * so the media plugin's gating applies; a remote one must match
 * `remotePatterns`.
 *
 * @example
 * ```ts
 * plumix({
 *   storage: diskStorage({ dir: "data/media" }),
 *   imageDelivery: images({ remotePatterns: [{ hostname: "images.example.com" }] }),
 * });
 * ```
 */
export function images(config: ImagesConfig = {}): NodeImageDelivery {
  const resolved = resolveConfig(config);
  let sharp: typeof SharpModule | undefined;
  const slot: NodeImageDelivery = {
    kind: "node-images",
    acceptsRelativeSources: true,
    config: resolved,
    sharp: () => (sharp ??= loadSharp()),
    url(sourceUrl: string, opts?: TransformOpts): string {
      if (
        isRemote(sourceUrl) &&
        !matchesRemotePattern(sourceUrl, resolved.remotePatterns)
      ) {
        return sourceUrl;
      }
      const transform = normalize(resolved, {
        ...opts,
        format: opts?.format === "auto" ? undefined : opts?.format,
      });
      const query = new URLSearchParams({ src: sourceUrl });
      if (transform.width !== undefined)
        query.set("w", String(transform.width));
      if (transform.height !== undefined)
        query.set("h", String(transform.height));
      if (transform.fit !== undefined) query.set("fit", transform.fit);
      if (transform.quality !== undefined)
        query.set("q", String(transform.quality));
      if (transform.format !== undefined) query.set("f", transform.format);
      return query.size === 1
        ? sourceUrl
        : `${IMAGE_ROUTE}?${query.toString()}`;
    },
    connect() {
      slot.sharp();
      return slot;
    },
  };
  return slot;
}

export function isNodeImages(
  slot: ImageDelivery | undefined,
): slot is NodeImageDelivery {
  return slot?.kind === "node-images";
}

import { resolve } from "node:path";
import type { ImageDelivery, PlumixEnv } from "plumix";
import type { RemotePattern } from "plumix/blocks/renderer";
import type { ImageFormat } from "plumix/runtime";
import { imageSourceKey, imageTransformUrl } from "plumix/runtime";

import type { VariantCache } from "./image-cache.js";
import { ImagesError } from "./errors.js";
import { createVariantCache } from "./image-cache.js";

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

interface ResolvedImagesConfig {
  /** Ascending, deduplicated. */
  readonly widths: readonly number[];
  readonly remotePatterns: readonly RemotePattern[];
  /** Absolute. */
  readonly cacheDir: string;
}

export interface BunImageDelivery extends ImageDelivery {
  readonly kind: "bun-images";
  readonly acceptsRelativeSources: true;
  readonly config: ResolvedImagesConfig;
  /** The variants under `cacheDir`, shared with the route. */
  readonly cache: VariantCache;
  /**
   * The formats `Bun.Image` encodes on this host, probed once, on `connect`.
   * AVIF needs an OS encoder, which Linux does not have.
   */
  encodable(): Promise<readonly ImageFormat[]>;
  purge(sourceUrl: string): Promise<void>;
  connect(env: PlumixEnv, ctx?: { readonly basePath: string }): ImageDelivery;
}

const DEFAULT_WIDTHS = [320, 640, 768, 1024, 1280, 1536, 1920];
const DEFAULT_CACHE_DIR = ".cache/plumix/images";
const PROBED: readonly ImageFormat[] = ["jpeg", "webp", "avif"];
// A 1×1 PNG, the smallest input every encoder can be asked to take.
const PIXEL = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (char) => char.charCodeAt(0),
);

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

/** Encode `image` as `format`; each setter records the format it names. */
export function encodeAs(
  image: Bun.Image,
  format: ImageFormat | "png",
  quality: number | undefined,
): Bun.Image {
  const options = quality === undefined ? {} : { quality };
  switch (format) {
    case "jpeg":
      return image.jpeg(options);
    case "webp":
      return image.webp(options);
    case "avif":
      return image.avif(options);
    case "png":
      return image.png();
  }
}

// A format the host cannot encode rejects at the terminal, whatever the
// input, so one pixel through each encoder is the whole probe.
async function probeEncodable(): Promise<readonly ImageFormat[]> {
  const results = await Promise.all(
    PROBED.map((format) =>
      encodeAs(new Bun.Image(PIXEL), format, undefined)
        .bytes()
        .then(
          () => true,
          () => false,
        ),
    ),
  );
  return PROBED.filter((_, index) => results[index]);
}

/**
 * The `imageDelivery` slot on Bun: `url()` is URL math onto
 * `/_plumix/image`, which the serve path answers through `Bun.Image`. A
 * same-origin source is resolved through the site's own handler, so the
 * media plugin's gating applies; a remote one must match `remotePatterns`.
 *
 * @example
 * ```ts
 * plumix({
 *   storage: diskStorage({ dir: "data/media" }),
 *   imageDelivery: images({ remotePatterns: [{ hostname: "images.example.com" }] }),
 * });
 * ```
 */
export function images(config: ImagesConfig = {}): BunImageDelivery {
  const resolved = resolveConfig(config);
  let probe: Promise<readonly ImageFormat[]> | undefined;
  const slot: BunImageDelivery = {
    kind: "bun-images",
    acceptsRelativeSources: true,
    config: resolved,
    cache: createVariantCache(resolved.cacheDir),
    encodable: () => (probe ??= probeEncodable()),
    purge: (sourceUrl) => slot.cache.purge(imageSourceKey(sourceUrl)),
    url: (sourceUrl, opts) =>
      imageTransformUrl({ ...resolved, basePath: "" }, sourceUrl, opts),
    // A distinct object per basePath rather than a mutated `slot`, so one
    // `images()` connected more than once never leaks one connection's
    // basePath into another's.
    connect(_env, ctx) {
      void slot.encodable();
      const basePath = ctx?.basePath ?? "";
      if (basePath === "") return slot;
      return {
        ...slot,
        url: (sourceUrl, opts) =>
          imageTransformUrl({ ...resolved, basePath }, sourceUrl, opts),
      };
    },
  };
  return slot;
}

export function isBunImages(
  slot: ImageDelivery | undefined,
): slot is BunImageDelivery {
  return slot?.kind === "bun-images";
}

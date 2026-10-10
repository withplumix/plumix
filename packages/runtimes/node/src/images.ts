import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { ImageDelivery } from "plumix";
import type { RemotePattern } from "plumix/blocks/renderer";
import type SharpModule from "sharp";
import { imageSourceKey, imageTransformUrl } from "plumix/runtime";

import type { VariantCache } from "./image-cache.js";
import { ImagesError } from "./errors.js";
import { createVariantCache } from "./image-cache.js";

export interface ImagesConfig {
  /**
   * A request snaps up to the next width; bounds what a visitor can make the
   * process render.
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
  /**
   * How many bytes of variants `cacheDir` may hold; 1 GiB by default. Past
   * it, the least recently served variant is dropped.
   */
  readonly cacheSize?: number;
}

export interface ResolvedImagesConfig {
  /** Ascending, deduplicated. */
  readonly widths: readonly number[];
  readonly remotePatterns: readonly RemotePattern[];
  /** Absolute. */
  readonly cacheDir: string;
  readonly cacheSize: number;
}

export interface NodeImageDelivery extends ImageDelivery {
  readonly kind: "node-images";
  readonly acceptsRelativeSources: true;
  readonly config: ResolvedImagesConfig;
  /** `sharp`, loaded on first use; `connect` is the first user. */
  sharp(): typeof SharpModule;
  /** The variants under `cacheDir`, shared with the route. */
  readonly cache: VariantCache;
  purge(sourceUrl: string): Promise<void>;
}

const DEFAULT_WIDTHS = [320, 640, 768, 1024, 1280, 1536, 1920];
const DEFAULT_CACHE_DIR = ".cache/plumix/images";
const DEFAULT_CACHE_SIZE = 1024 * 1024 * 1024;

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
  const cacheSize = config.cacheSize ?? DEFAULT_CACHE_SIZE;
  if (!Number.isInteger(cacheSize) || cacheSize <= 0) {
    throw ImagesError.invalidCacheSize({ cacheSize });
  }
  return {
    widths,
    remotePatterns: config.remotePatterns ?? [],
    cacheDir: resolve(config.cacheDir ?? DEFAULT_CACHE_DIR),
    cacheSize,
  };
}

const ownRequire = createRequire(import.meta.url);

/**
 * `sharp` is an optional peer, so a site without images() installs nothing
 * native; a missing package is named on first use.
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
 * A same-origin source resolves through the site's handler, so media gating
 * applies; a remote one must match `remotePatterns`.
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
    cache: createVariantCache(resolved.cacheDir, resolved.cacheSize),
    purge: (sourceUrl) => slot.cache.purge(imageSourceKey(sourceUrl)),
    url: (sourceUrl, opts) =>
      imageTransformUrl({ ...resolved, basePath: "" }, sourceUrl, opts),
    // A distinct object per connection, so one connection's basePath never
    // leaks into another's.
    connect(_env, ctx) {
      slot.sharp();
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

export function isNodeImages(
  slot: ImageDelivery | undefined,
): slot is NodeImageDelivery {
  return slot?.kind === "node-images";
}

import type { ImageDelivery, TransformOpts } from "@plumix/core";

export interface ImagesConfig {
  /**
   * Hostname of a Cloudflare zone that has Image Transformations enabled
   * and serves your bucket (typically R2 fronted by a custom domain).
   * No protocol or path — just the host: `"media.example.com"`.
   */
  readonly zone: string;
}

/**
 * Cloudflare Image Transformations URL builder. Pairs with `r2(...)` to
 * resize / format-convert images on the fly via `/cdn-cgi/image/<opts>/<src>`.
 *
 * Note: this is *Image Transformations* (cheap on-the-fly resizer over R2),
 * not the separate *Cloudflare Images* ingestion product. The zone must
 * already have Image Transformations enabled in the dashboard.
 *
 * @example
 * ```ts
 * plumix({
 *   storage: r2({ binding: "MEDIA", publicUrlBase: "https://media.example.com" }),
 *   imageDelivery: images({ zone: "media.example.com" }),
 * });
 * ```
 */
export function images(config: ImagesConfig): ImageDelivery {
  const zone = stripProtocolAndSlash(config.zone);
  const zonePrefix = `https://${zone}/`;

  return {
    kind: "cloudflare-images",
    url(sourceUrl: string, opts?: TransformOpts): string {
      const optsStr = serializeOpts(opts);
      if (optsStr.length === 0) return sourceUrl;
      const source = resolveSource(sourceUrl, zonePrefix);
      return `${zonePrefix}cdn-cgi/image/${optsStr}/${source}`;
    },
  };
}

function resolveSource(sourceUrl: string, zonePrefix: string): string {
  // Same-zone absolute URL — strip host so the transform points at the path
  // on the bucket. External URLs pass through verbatim and are only resolved
  // by the CDN if the zone allows external sources (off by default).
  if (sourceUrl.startsWith(zonePrefix))
    return sourceUrl.slice(zonePrefix.length);
  if (sourceUrl.startsWith("/")) return sourceUrl.slice(1);
  return sourceUrl;
}

// Order matches Cloudflare's URL convention; missing keys are skipped so
// `width=auto` (a real value) and `width=undefined` differ predictably.
const TRANSFORM_KEYS = [
  "width",
  "height",
  "fit",
  "quality",
  "format",
  "dpr",
] as const satisfies readonly (keyof TransformOpts)[];

function serializeOpts(opts: TransformOpts | undefined): string {
  if (!opts) return "";
  const parts: string[] = [];
  for (const key of TRANSFORM_KEYS) {
    const value = opts[key];
    if (value !== undefined) parts.push(`${key}=${String(value)}`);
  }
  return parts.join(",");
}

function stripProtocolAndSlash(zone: string): string {
  let z = zone;
  if (z.startsWith("https://")) z = z.slice("https://".length);
  else if (z.startsWith("http://")) z = z.slice("http://".length);
  if (z.endsWith("/")) z = z.slice(0, -1);
  return z;
}

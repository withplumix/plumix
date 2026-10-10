/**
 * In core so `@plumix/plugin-og` can subscribe to `seo:og_image` without
 * depending on `@plumix/plugin-seo`.
 */
export interface OgImage {
  readonly url: string;
  readonly width?: number;
  readonly height?: number;
  /** Absent, null and empty all read as undescribed. */
  readonly alt?: string | null;
}

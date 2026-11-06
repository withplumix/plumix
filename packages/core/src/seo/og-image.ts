/**
 * In core so the plugins that produce or subscribe to the page's og image
 * share one shape.
 */
export interface OgImage {
  readonly url: string;
  readonly width?: number;
  readonly height?: number;
  /** Absent, null and empty all read as undescribed. */
  readonly alt?: string | null;
}

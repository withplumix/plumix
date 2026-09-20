/**
 * A page's resolved social image. `width`/`height` are absent when the image's
 * size isn't known.
 *
 * The shape the `seo:og_image` filter is written in, which is why it lives in
 * core rather than in the plugin declaring that filter: `@plumix/plugin-og`
 * subscribes to it without depending on `@plumix/plugin-seo` at runtime.
 * A role's image (`entity.images.<role>`, a `ResolvedImage`) satisfies it.
 */
export interface OgImage {
  readonly url: string;
  readonly width?: number;
  readonly height?: number;
}

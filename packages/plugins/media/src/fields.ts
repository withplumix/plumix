// Public field-builder surface. Imported via `@plumix/plugin-media/fields`
// so consumers can pull the typed `media()` builder without colliding
// with `media()` (the plugin descriptor factory) exported from the
// package root. Mirrors the `plumix/fields` subpath convention from
// core.

export { media, mediaList } from "./builder.js";
export type {
  MediaFieldOptions,
  MediaListFieldOptions,
  MediaValue,
} from "./builder.js";

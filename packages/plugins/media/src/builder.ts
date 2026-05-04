import type { MediaMetaBoxField, MetaBoxFieldSpan } from "@plumix/core";

import type { MediaFieldScope } from "./lookup.js";

/**
 * Per-field options for the `media()` builder.
 *
 * `accept` filters the picker grid client-side (UX hint) AND the
 * `mediaLookupAdapter`'s `list({ ids })` path on the server (security
 * boundary — re-validated at write time). Format: a single MIME prefix
 * string (`"image/"` matches every `image/*` mime) OR a readonly array
 * of exact MIME matches (`["image/png", "application/pdf"]`).
 *
 * `default` is a `MediaValue` shape (`{ id, ... }`) — the meta pipeline
 * normalizes the cached fields on every write, so a new entry with a
 * `default: { id: "42" }` ships with the canonical `{ id, mime,
 * filename }` after the first save.
 */
export interface MediaFieldOptions {
  readonly key: string;
  readonly label: string;
  readonly required?: boolean;
  readonly description?: string;
  readonly default?: MediaValue;
  readonly span?: MetaBoxFieldSpan;
  readonly accept?: string | readonly string[];
}

/**
 * Storage shape for a single `media` field. The meta pipeline writes
 * `{ id, ...adapterCached }` on every save (mime + filename today;
 * width/height/etc once the upload pipeline captures them). Renders
 * read straight from this object — no `lookup.resolve` per field.
 */
export interface MediaValue {
  readonly id: string;
  readonly mime?: string;
  readonly filename?: string;
}

/**
 * Build a typed `media` reference field. Stored as a `MediaValue`
 * object — admin thumbnails render without a resolve round-trip, the
 * meta pipeline rewrites the cached fields on every write so the
 * snapshot stays close to the asset.
 *
 * The picker opens the existing Media Library in modal/picker mode,
 * filters the grid to MIME `accept` if set, and emits the bare id +
 * cached fields back to the form on selection.
 *
 * Single-value only — `mediaList()` covers the multi case (slice
 * #132).
 */
export function media(options: MediaFieldOptions): MediaMetaBoxField {
  const scope: MediaFieldScope = { accept: options.accept };
  return {
    key: options.key,
    label: options.label,
    type: "json",
    inputType: "media",
    referenceTarget: { kind: "media", scope, valueShape: "object" },
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
  };
}

import type {
  MediaListMetaBoxField,
  MediaMetaBoxField,
  MetaBoxFieldSpan,
} from "plumix/plugin";

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

/**
 * Per-field options for the `mediaList()` builder. Multi-value
 * counterpart to `media()` — same `accept` semantics, plus a `max`
 * length cap. Storage is `MediaValue[]`.
 */
export interface MediaListFieldOptions {
  readonly key: string;
  readonly label: string;
  readonly required?: boolean;
  readonly description?: string;
  readonly default?: readonly MediaValue[];
  readonly span?: MetaBoxFieldSpan;
  readonly accept?: string | readonly string[];
  /** Max items allowed in the array. Omitted = unbounded. */
  readonly max?: number;
}

/**
 * Build a typed `mediaList` reference field — the multi-value
 * counterpart to `media()`. Storage is `MediaValue[]` —
 * `[{ id, mime?, filename? }, ...]`. The meta pipeline rewrites
 * each entry's cached fields on every write so reads can render
 * thumbnails without a per-item resolve round-trip.
 *
 * Picker stays open across selections (so authors can pick several
 * without re-opening) and auto-stops when `max` is reached.
 * Selected items render as a vertical list with up/down reorder
 * and per-item removal; drag-reorder is deferred to a follow-up
 * (see `MediaListPickerField`).
 */
export function mediaList(
  options: MediaListFieldOptions,
): MediaListMetaBoxField {
  const scope: MediaFieldScope = { accept: options.accept };
  return {
    key: options.key,
    label: options.label,
    type: "json",
    inputType: "mediaList",
    referenceTarget: {
      kind: "media",
      scope,
      valueShape: "object",
      multiple: true,
    },
    max: options.max,
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
  };
}

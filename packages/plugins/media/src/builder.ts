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
 * `default` is the media entry's id.
 */
export interface MediaFieldOptions {
  readonly key: string;
  readonly label: string;
  readonly required?: boolean;
  readonly description?: string;
  readonly default?: string;
  readonly span?: MetaBoxFieldSpan;
  readonly accept?: string | readonly string[];
}

/**
 * Build a typed `media` reference field. Storage is the plain media
 * id; admin renders resolve labels through the lookup path.
 *
 * The picker opens the existing Media Library in modal/picker mode,
 * filters the grid to MIME `accept` if set, and emits the picked id
 * back to the form on selection.
 *
 * Single-value only — `mediaList()` covers the multi case.
 */
export function media(options: MediaFieldOptions): MediaMetaBoxField {
  const scope: MediaFieldScope = { accept: options.accept };
  return {
    key: options.key,
    label: options.label,
    type: "json",
    inputType: "media",
    referenceTarget: { kind: "media", scope },
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
  };
}

/**
 * Per-field options for the `mediaList()` builder. Multi-value
 * counterpart to `media()` — same `accept` semantics, plus a `max`
 * length cap. `default` is an array of media entry ids.
 */
export interface MediaListFieldOptions {
  readonly key: string;
  readonly label: string;
  readonly required?: boolean;
  readonly description?: string;
  readonly default?: readonly string[];
  readonly span?: MetaBoxFieldSpan;
  readonly accept?: string | readonly string[];
  /** Max items allowed in the array. Omitted = unbounded. */
  readonly max?: number;
}

/**
 * Build a typed `mediaList` reference field — the multi-value
 * counterpart to `media()`. Storage is a dense array of plain media
 * ids; admin renders resolve labels in one batched lookup.
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
      multiple: true,
    },
    max: options.max,
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
  };
}

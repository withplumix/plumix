import type { MetaBoxFieldSpan, RichtextMetaBoxField } from "../manifest.js";
import { walkRichtextDoc } from "./richtext-validate.js";

/** Per-field options for `richtext()`. See `RichtextMetaBoxField`. */
export interface RichtextFieldOptions {
  readonly key: string;
  readonly label: string;
  readonly required?: boolean;
  readonly description?: string;
  readonly default?: unknown;
  readonly span?: MetaBoxFieldSpan;
  readonly marks?: readonly string[];
  readonly nodes?: readonly string[];
  readonly blocks?: readonly string[];
}

/**
 * Build a typed `richtext` meta-box field. Storage is Tiptap's
 * ProseMirror JSON shape, round-tripped through the `json` storage
 * primitive. The `sanitize` validator is auto-injected so the meta
 * pipeline rejects nodes/marks/blocks outside the allowlist (and
 * unsafe link hrefs) without the consumer wiring anything — errors
 * surface as `meta_invalid_value` via `runSanitize`.
 */
export function richtext(options: RichtextFieldOptions): RichtextMetaBoxField {
  return {
    key: options.key,
    label: options.label,
    type: "json",
    inputType: "richtext",
    marks: options.marks,
    nodes: options.nodes,
    blocks: options.blocks,
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
    sanitize: walkRichtextDoc({
      marks: options.marks,
      nodes: options.nodes,
      blocks: options.blocks,
    }),
  };
}

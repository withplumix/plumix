import type { MetaBoxFieldSpan, RichtextMetaBoxField } from "../manifest.js";

/**
 * Per-field options for `richtext()`. The three allowlists are strict:
 * a Tiptap mark/node/block whose name isn't listed is rejected by the
 * server-side validator and hidden from the admin's toolbar. Omit to
 * deny everything in that category (still allows the implicit
 * `doc` / `paragraph` / `text` baseline ProseMirror requires).
 *
 * `marks` are inline formatters (`bold`, `italic`, `link`, …).
 * `nodes` are block-level Tiptap nodes (`heading`, `bulletList`,
 * `codeBlock`, `image`, …).
 * `blocks` are plumix-registered custom Tiptap nodes/marks declared
 * via `ctx.registerBlock` on the server, with React components
 * registered via `window.plumix.registerPluginBlock` on the admin.
 *
 * Replaces the dropped `markdown` / `code` standalone field types:
 *  - `richtext({ nodes: ["codeBlock"] })` → code-only
 *  - `richtext({ marks: ["bold","italic","link"], nodes: ["bulletList","orderedList"] })`
 *    → markdown-shaped formatting
 */
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
 * ProseMirror JSON shape (`{ type, content?, marks?, attrs? }`)
 * round-tripped through the existing `json` storage primitive.
 *
 * The `sanitize` validator (added in a follow-up commit) walks the
 * stored doc against the field's allowlist and rejects disallowed
 * names with a precise location pointer. The admin's TiptapEditor
 * projects the same allowlist onto its StarterKit configuration +
 * plugin block registry so the toolbar surfaces only the allowed
 * affordances.
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
  };
}

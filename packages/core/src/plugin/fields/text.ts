import type { MetaBoxFieldSpan, TextMetaBoxField } from "../manifest.js";

/**
 * Caller-side options for `text()`. Mirrors `TextMetaBoxField` but
 * omits `inputType` and `type` — the builder pins those — and `key` /
 * `label`, which sit on the top level for ergonomics. Excludes every
 * option that doesn't apply to a text input (`min`, `max`, `step`,
 * `options`), so the type system rejects e.g. `text({ min: 5 })`.
 */
export interface TextFieldOptions {
  readonly key: string;
  readonly label: string;
  readonly placeholder?: string;
  readonly maxLength?: number;
  readonly required?: boolean;
  readonly description?: string;
  readonly default?: string;
  readonly span?: MetaBoxFieldSpan;
  readonly sanitize?: (value: unknown) => unknown;
}

/**
 * Build a typed `text` meta-box field. Sugar over the broad
 * `MetaBoxField` shape with the right `inputType` / `type` pinned and
 * non-text options excluded at the type level.
 *
 * @example
 * registerEntryMetaBox("seo", {
 *   label: "SEO",
 *   entryTypes: ["post"],
 *   fields: [
 *     text({ key: "title", label: "Meta title", maxLength: 60 }),
 *   ],
 * });
 */
export function text(options: TextFieldOptions): TextMetaBoxField {
  return {
    key: options.key,
    label: options.label,
    type: "string",
    inputType: "text",
    placeholder: options.placeholder,
    maxLength: options.maxLength,
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
    sanitize: options.sanitize,
  };
}

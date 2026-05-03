import type { CheckboxMetaBoxField, MetaBoxFieldSpan } from "../manifest.js";

export interface CheckboxFieldOptions {
  readonly key: string;
  readonly label: string;
  readonly required?: boolean;
  readonly description?: string;
  readonly default?: boolean;
  readonly span?: MetaBoxFieldSpan;
  readonly sanitize?: (value: unknown) => unknown;
}

/**
 * Build a typed `checkbox` meta-box field. Storage type is pinned to
 * `boolean`; the renderer carries the label inline next to the input
 * rather than above (see `meta-box-field.tsx`).
 */
export function checkbox(options: CheckboxFieldOptions): CheckboxMetaBoxField {
  return {
    key: options.key,
    label: options.label,
    type: "boolean",
    inputType: "checkbox",
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
    sanitize: options.sanitize,
  };
}

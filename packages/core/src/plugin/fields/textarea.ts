import type { MetaBoxFieldSpan, TextareaMetaBoxField } from "../manifest.js";

export interface TextareaFieldOptions {
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
 * Build a typed `textarea` meta-box field. Same option shape as `text()`
 * but renders as a multi-line textarea in the admin.
 */
export function textarea(options: TextareaFieldOptions): TextareaMetaBoxField {
  return {
    key: options.key,
    label: options.label,
    type: "string",
    inputType: "textarea",
    placeholder: options.placeholder,
    maxLength: options.maxLength,
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
    sanitize: options.sanitize,
  };
}

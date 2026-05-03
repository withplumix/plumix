import type { MetaBoxFieldSpan, UrlMetaBoxField } from "../manifest.js";

export interface UrlFieldOptions {
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

/** Build a typed `url` meta-box field. Renders as `<input type="url">`. */
export function url(options: UrlFieldOptions): UrlMetaBoxField {
  return {
    key: options.key,
    label: options.label,
    type: "string",
    inputType: "url",
    placeholder: options.placeholder,
    maxLength: options.maxLength,
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
    sanitize: options.sanitize,
  };
}

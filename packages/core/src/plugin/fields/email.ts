import type { EmailMetaBoxField, MetaBoxFieldSpan } from "../manifest.js";

export interface EmailFieldOptions {
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

/** Build a typed `email` meta-box field. Renders as `<input type="email">`. */
export function email(options: EmailFieldOptions): EmailMetaBoxField {
  return {
    key: options.key,
    label: options.label,
    type: "string",
    inputType: "email",
    placeholder: options.placeholder,
    maxLength: options.maxLength,
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
    sanitize: options.sanitize,
  };
}

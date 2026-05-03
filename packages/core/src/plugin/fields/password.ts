import type { MetaBoxFieldSpan, PasswordMetaBoxField } from "../manifest.js";

export interface PasswordFieldOptions {
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
 * Build a typed `password` meta-box field. Renders with masked input
 * (`<input type="password">`) so the value isn't visible at a glance
 * — useful for non-secret-but-sensitive fields (display PINs,
 * recovery codes copied into a settings group). Storage shape is
 * identical to `text`; nothing here is a substitute for actual
 * encrypted-at-rest storage if the value is a real secret.
 */
export function password(options: PasswordFieldOptions): PasswordMetaBoxField {
  return {
    key: options.key,
    label: options.label,
    type: "string",
    inputType: "password",
    placeholder: options.placeholder,
    maxLength: options.maxLength,
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
    sanitize: options.sanitize,
  };
}

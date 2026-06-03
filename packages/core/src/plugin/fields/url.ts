import type { Label } from "../../i18n/label.js";
import type { MetaBoxFieldSpan, UrlMetaBoxField } from "../manifest.js";

export interface UrlFieldOptions {
  readonly key: string;
  readonly label: Label;
  readonly placeholder?: Label;
  readonly maxLength?: number;
  readonly required?: boolean;
  readonly description?: Label;
  readonly default?: string;
  readonly span?: MetaBoxFieldSpan;
  readonly capability?: string;
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
    capability: options.capability,
    sanitize: options.sanitize,
  };
}

import type { Label } from "../../i18n/label.js";
import type { JsonMetaBoxField, MetaBoxFieldSpan } from "../manifest.js";

export interface JsonFieldOptions {
  readonly key: string;
  readonly label: Label;
  readonly required?: boolean;
  readonly description?: Label;
  readonly default?: unknown;
  readonly span?: MetaBoxFieldSpan;
  readonly capability?: string;
  readonly sanitize?: (value: unknown) => unknown;
}

/**
 * Build a typed `json` meta-box field. Storage round-trips through
 * `JSON.stringify` so any value that survives serialisation survives
 * the wire.
 */
export function json(options: JsonFieldOptions): JsonMetaBoxField {
  return {
    key: options.key,
    label: options.label,
    type: "json",
    inputType: "json",
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
    capability: options.capability,
    sanitize: options.sanitize,
  };
}

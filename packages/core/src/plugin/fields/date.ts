import type { Label } from "../../i18n/label.js";
import type { DateMetaBoxField, MetaBoxFieldSpan } from "../manifest.js";

export interface DateFieldOptions {
  readonly key: string;
  readonly label: Label;
  /** ISO 8601 date string `YYYY-MM-DD`. Lower bound applied client-side. */
  readonly min?: string;
  /** ISO 8601 date string `YYYY-MM-DD`. Upper bound applied client-side. */
  readonly max?: string;
  readonly required?: boolean;
  readonly description?: Label;
  readonly default?: string;
  readonly span?: MetaBoxFieldSpan;
  readonly capability?: string;
  readonly sanitize?: (value: unknown) => unknown;
}

/**
 * Build a typed `date` meta-box field. Stored as a `YYYY-MM-DD`
 * calendar string; renders as a native `<input type="date">` in the
 * admin. Use `parseMetaDate` to coerce stored values into a JS `Date`
 * on the read side.
 */
export function date(options: DateFieldOptions): DateMetaBoxField {
  return {
    key: options.key,
    label: options.label,
    type: "string",
    inputType: "date",
    min: options.min,
    max: options.max,
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
    capability: options.capability,
    sanitize: options.sanitize,
  };
}

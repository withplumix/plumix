import type { DateTimeMetaBoxField, MetaBoxFieldSpan } from "../manifest.js";

export interface DateTimeFieldOptions {
  readonly key: string;
  readonly label: string;
  /** ISO 8601 datetime-local string (`YYYY-MM-DDTHH:MM`). */
  readonly min?: string;
  /** ISO 8601 datetime-local string (`YYYY-MM-DDTHH:MM`). */
  readonly max?: string;
  readonly required?: boolean;
  readonly description?: string;
  readonly default?: string;
  readonly span?: MetaBoxFieldSpan;
  readonly sanitize?: (value: unknown) => unknown;
}

/**
 * Build a typed `datetime` meta-box field. Storage is a partial ISO
 * 8601 string (`YYYY-MM-DDTHH:MM` with optional `:SS`) reflecting
 * what the author entered via `<input type="datetime-local">` —
 * naive local time, no timezone offset baked in. A future iteration
 * may upgrade storage to ISO with offset; consumers who need
 * timezone semantics today should anchor with `Temporal` or similar.
 */
export function datetime(options: DateTimeFieldOptions): DateTimeMetaBoxField {
  return {
    key: options.key,
    label: options.label,
    type: "string",
    inputType: "datetime",
    min: options.min,
    max: options.max,
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
    sanitize: options.sanitize,
  };
}

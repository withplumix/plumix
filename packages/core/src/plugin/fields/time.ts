import type { MetaBoxFieldSpan, TimeMetaBoxField } from "../manifest.js";

export interface TimeFieldOptions {
  readonly key: string;
  readonly label: string;
  /** Lower bound `HH:MM` (with optional `:SS`). */
  readonly min?: string;
  /** Upper bound `HH:MM` (with optional `:SS`). */
  readonly max?: string;
  readonly required?: boolean;
  readonly description?: string;
  readonly default?: string;
  readonly span?: MetaBoxFieldSpan;
  readonly sanitize?: (value: unknown) => unknown;
}

/**
 * Build a typed `time` meta-box field. Stored as `HH:MM` (with
 * optional `:SS`); renders as a native `<input type="time">`. No
 * date or timezone — combine with a `date` field when both are
 * needed.
 */
export function time(options: TimeFieldOptions): TimeMetaBoxField {
  return {
    key: options.key,
    label: options.label,
    type: "string",
    inputType: "time",
    min: options.min,
    max: options.max,
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
    sanitize: options.sanitize,
  };
}

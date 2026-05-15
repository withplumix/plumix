import type { MetaBoxFieldSpan, RangeMetaBoxField } from "../manifest.js";
import { FieldConfigError } from "./errors.js";

export interface RangeFieldOptions {
  readonly key: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly required?: boolean;
  readonly description?: string;
  readonly default?: number;
  readonly span?: MetaBoxFieldSpan;
  /**
   * Optional override. The builder ships a default sanitizer that
   * enforces the declared `min`/`max` bounds on write; passing a
   * custom one replaces it entirely.
   */
  readonly sanitize?: (value: unknown) => unknown;
}

/**
 * Build a typed `range` meta-box field. Renders as a slider in the
 * admin. Both `min` and `max` are required; `min <= max` is enforced
 * at registration time. The builder injects a default sanitizer that
 * rejects values outside `[min, max]` on write.
 */
export function range(options: RangeFieldOptions): RangeMetaBoxField {
  if (options.min > options.max) {
    throw FieldConfigError.rangeMinGreaterThanMax({
      fieldKey: options.key,
      min: options.min,
      max: options.max,
    });
  }
  const { min, max } = options;
  return {
    key: options.key,
    label: options.label,
    type: "number",
    inputType: "range",
    min,
    max,
    step: options.step,
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
    sanitize: options.sanitize ?? buildBoundsSanitizer(min, max),
  };
}

function buildBoundsSanitizer(
  min: number,
  max: number,
): (value: unknown) => number {
  return (value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      // eslint-disable-next-line no-restricted-syntax -- sanitizer flow-control sentinel; migrated in the field-sanitizer-error slice
      throw new Error("invalid_value");
    }
    if (value < min || value > max) {
      // eslint-disable-next-line no-restricted-syntax -- sanitizer flow-control sentinel; migrated in the field-sanitizer-error slice
      throw new Error("invalid_value");
    }
    return value;
  };
}

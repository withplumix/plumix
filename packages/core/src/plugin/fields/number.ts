import type { MetaBoxFieldSpan, NumberMetaBoxField } from "../manifest.js";

export interface NumberFieldOptions {
  readonly key: string;
  readonly label: string;
  readonly placeholder?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly required?: boolean;
  readonly description?: string;
  readonly default?: number;
  readonly span?: MetaBoxFieldSpan;
  readonly sanitize?: (value: unknown) => unknown;
}

/**
 * Build a typed `number` meta-box field. `step` defaults to `1` (integer
 * input) when omitted at the renderer; the registration shape leaves it
 * `undefined` so the manifest stays minimal.
 */
export function number(options: NumberFieldOptions): NumberMetaBoxField {
  return {
    key: options.key,
    label: options.label,
    type: "number",
    inputType: "number",
    placeholder: options.placeholder,
    min: options.min,
    max: options.max,
    step: options.step,
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
    sanitize: options.sanitize,
  };
}

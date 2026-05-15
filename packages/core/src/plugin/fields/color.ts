import type { ColorMetaBoxField, MetaBoxFieldSpan } from "../manifest.js";

export interface ColorFieldOptions {
  readonly key: string;
  readonly label: string;
  readonly required?: boolean;
  readonly description?: string;
  /** Hex string `#xxxxxx` (or `#xxx` shorthand). Must match `HEX_COLOR`. */
  readonly default?: string;
  readonly span?: MetaBoxFieldSpan;
  /**
   * Optional override. The builder ships a default sanitizer that
   * rejects non-hex values; passing a custom one replaces it
   * entirely, so authors taking over validation should re-check the
   * hex shape themselves.
   */
  readonly sanitize?: (value: unknown) => unknown;
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Build a typed `color` meta-box field. Storage is the hex string
 * the native `<input type="color">` produces (`#rrggbb`). The
 * builder injects a default sanitizer that rejects any value that
 * doesn't match `#xxx` / `#xxxxxx` on write — pass `sanitize` to
 * override.
 */
export function color(options: ColorFieldOptions): ColorMetaBoxField {
  return {
    key: options.key,
    label: options.label,
    type: "string",
    inputType: "color",
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
    sanitize: options.sanitize ?? defaultColorSanitize,
  };
}

function defaultColorSanitize(value: unknown): string {
  if (typeof value !== "string" || !HEX_COLOR.test(value)) {
    // eslint-disable-next-line no-restricted-syntax -- sanitizer flow-control sentinel; migrated in the field-sanitizer-error slice
    throw new Error("invalid_value");
  }
  return value.toLowerCase();
}

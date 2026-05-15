import type {
  MetaBoxFieldOption,
  MetaBoxFieldSpan,
  MultiselectMetaBoxField,
} from "../manifest.js";

export interface MultiselectFieldOptions {
  readonly key: string;
  readonly label: string;
  readonly options: readonly MetaBoxFieldOption[];
  readonly required?: boolean;
  readonly description?: string;
  readonly default?: readonly string[];
  readonly span?: MetaBoxFieldSpan;
  readonly sanitize?: (value: unknown) => unknown;
}

/**
 * Build a typed `multiselect` meta-box field. `options` is required.
 * Storage is an array of selected option `value` strings; the
 * default sanitizer rejects values outside the declared options
 * and de-duplicates.
 */
export function multiselect(
  options: MultiselectFieldOptions,
): MultiselectMetaBoxField {
  return {
    key: options.key,
    label: options.label,
    type: "json",
    inputType: "multiselect",
    options: options.options,
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
    sanitize: options.sanitize ?? buildOptionSanitizer(options.options),
  };
}

function buildOptionSanitizer(
  optionList: readonly MetaBoxFieldOption[],
): (value: unknown) => readonly string[] {
  const allowed = new Set(optionList.map((opt) => opt.value));
  return (value) => {
    // eslint-disable-next-line no-restricted-syntax -- sanitizer flow-control sentinel; migrated in the field-sanitizer-error slice
    if (!Array.isArray(value)) throw new Error("invalid_value");
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of value) {
      if (typeof item !== "string" || !allowed.has(item)) {
        // eslint-disable-next-line no-restricted-syntax -- sanitizer flow-control sentinel; migrated in the field-sanitizer-error slice
        throw new Error("invalid_value");
      }
      if (!seen.has(item)) {
        seen.add(item);
        out.push(item);
      }
    }
    return out;
  };
}

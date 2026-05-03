import type {
  MetaBoxFieldOption,
  MetaBoxFieldSpan,
  SelectMetaBoxField,
} from "../manifest.js";

export interface SelectFieldOptions {
  readonly key: string;
  readonly label: string;
  readonly options: readonly MetaBoxFieldOption[];
  readonly required?: boolean;
  readonly description?: string;
  readonly default?: string;
  readonly span?: MetaBoxFieldSpan;
  readonly sanitize?: (value: unknown) => unknown;
}

/**
 * Build a typed `select` meta-box field. `options` is required — the
 * builder enforces this at the type level so a dropdown without choices
 * fails to compile.
 */
export function select(options: SelectFieldOptions): SelectMetaBoxField {
  return {
    key: options.key,
    label: options.label,
    type: "string",
    inputType: "select",
    options: options.options,
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
    sanitize: options.sanitize,
  };
}

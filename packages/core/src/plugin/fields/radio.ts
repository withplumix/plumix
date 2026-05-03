import type {
  MetaBoxFieldOption,
  MetaBoxFieldSpan,
  RadioMetaBoxField,
} from "../manifest.js";

export interface RadioFieldOptions {
  readonly key: string;
  readonly label: string;
  readonly options: readonly MetaBoxFieldOption[];
  readonly required?: boolean;
  readonly description?: string;
  readonly default?: string;
  readonly span?: MetaBoxFieldSpan;
  readonly sanitize?: (value: unknown) => unknown;
}

/** Build a typed `radio` meta-box field. `options` is required. */
export function radio(options: RadioFieldOptions): RadioMetaBoxField {
  return {
    key: options.key,
    label: options.label,
    type: "string",
    inputType: "radio",
    options: options.options,
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
    sanitize: options.sanitize,
  };
}

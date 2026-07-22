import type { Label } from "../../i18n/label.js";
import type {
  FieldBuilder,
  MetaBoxFieldSpan,
  MetaBoxFieldValidate,
  StringInputType,
  StringMetaBoxField,
} from "../manifest.js";

export type { StringInputType } from "../manifest.js";

// "heroImage" → "Hero image", "site_title" → "Site title". Derived
// default for fields authored without `.label()`.
function humanizeFieldKey(key: string): string {
  const spaced = key
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll(/[_:-]+/g, " ")
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

interface StringFieldState {
  readonly label?: Label;
  readonly description?: Label;
  readonly placeholder?: Label;
  readonly prepend?: Label;
  readonly append?: Label;
  readonly default?: string;
  readonly required?: true;
  readonly span?: MetaBoxFieldSpan;
  readonly capability?: string;
  readonly showInApi?: true;
  readonly maxLength?: number;
  readonly sanitize?: (value: unknown) => unknown;
  readonly validate?: MetaBoxFieldValidate;
}

/**
 * Fluent chain for the string scalar fields (`text`, `textarea`,
 * `email`, `url`, `password`). Immutable — every call returns a fresh
 * instance, so a shared base chain can be forked without aliasing.
 * `V` is the phantom value type the field reads as: `string |
 * undefined` unadorned, narrowed to `string` by `.required()` /
 * `.default()`. Purely type-level — nothing at runtime carries it.
 */
export class StringFieldBuilder<
  Input extends StringInputType = StringInputType,
  V extends string | undefined = string | undefined,
> implements FieldBuilder<StringMetaBoxField<Input>> {
  /** Phantom read type of the field — type-level only, never assigned. */
  declare readonly _value: V;

  readonly #inputType: Input;
  readonly #key: string;
  readonly #state: StringFieldState;

  constructor(inputType: Input, key: string, state: StringFieldState = {}) {
    this.#inputType = inputType;
    this.#key = key;
    this.#state = state;
  }

  #fork<V2 extends string | undefined = V>(
    patch: Partial<StringFieldState>,
  ): StringFieldBuilder<Input, V2> {
    return new StringFieldBuilder<Input, V2>(this.#inputType, this.#key, {
      ...this.#state,
      ...patch,
    });
  }

  /** Override the derived (humanized-key) label. */
  label(label: Label): StringFieldBuilder<Input, V> {
    return this.#fork({ label });
  }

  /** Help text rendered under the label. */
  description(description: Label): StringFieldBuilder<Input, V> {
    return this.#fork({ description });
  }

  placeholder(placeholder: Label): StringFieldBuilder<Input, V> {
    return this.#fork({ placeholder });
  }

  /** Static adornment rendered before the input. */
  prepend(prepend: Label): StringFieldBuilder<Input, V> {
    return this.#fork({ prepend });
  }

  /** Static adornment rendered after the input. */
  append(append: Label): StringFieldBuilder<Input, V> {
    return this.#fork({ append });
  }

  /** Admin-form prefill for unsaved keys — narrows the read type to `string`. */
  default(value: string): StringFieldBuilder<Input, string> {
    return this.#fork<string>({ default: value });
  }

  /** Mark the field required — narrows the read type to `string`. */
  required(): StringFieldBuilder<Input, string> {
    return this.#fork<string>({ required: true });
  }

  /**
   * Column span within the box's 12-column grid — a universal layout
   * hint; surfaces that can't honor it (the entry editor rail) ignore it.
   */
  span(span: MetaBoxFieldSpan): StringFieldBuilder<Input, V> {
    return this.#fork({ span });
  }

  /** Capability gate for this field — see `MetaBoxFieldBase.capability`. */
  capability(capability: string): StringFieldBuilder<Input, V> {
    return this.#fork({ capability });
  }

  /** Opt this field's value into public REST responses (default-deny). */
  showInApi(): StringFieldBuilder<Input, V> {
    return this.#fork({ showInApi: true });
  }

  maxLength(maxLength: number): StringFieldBuilder<Input, V> {
    return this.#fork({ maxLength });
  }

  /** Normalising transform, applied after coercion and before persistence. */
  sanitize(
    sanitize: (value: NonNullable<V>) => NonNullable<V>,
  ): StringFieldBuilder<Input, V> {
    return this.#fork({ sanitize: sanitize as (value: unknown) => unknown });
  }

  /**
   * Custom validation — `true` for valid, or an i18n-able failure
   * message (sync or async). Runs after `.sanitize()` and the
   * declarative constraints.
   */
  validate(
    validate: (value: NonNullable<V>) => true | Label | Promise<true | Label>,
  ): StringFieldBuilder<Input, V> {
    return this.#fork({ validate: validate as MetaBoxFieldValidate });
  }

  /** Compile the chain into the wire/manifest field definition. */
  build(): StringMetaBoxField<Input> {
    return {
      ...this.#state,
      key: this.#key,
      label: this.#state.label ?? humanizeFieldKey(this.#key),
      type: "string",
      inputType: this.#inputType,
    };
  }
}

/** Single-line text input. */
export function text(key: string): StringFieldBuilder<"text"> {
  return new StringFieldBuilder("text", key);
}

/** Multi-line text input. Storage shape mirrors `text`. */
export function textarea(key: string): StringFieldBuilder<"textarea"> {
  return new StringFieldBuilder("textarea", key);
}

/** RFC-5322-shaped email input. */
export function email(key: string): StringFieldBuilder<"email"> {
  return new StringFieldBuilder("email", key);
}

/** URL input. */
export function url(key: string): StringFieldBuilder<"url"> {
  return new StringFieldBuilder("url", key);
}

/** Masked-input password field — see `PasswordMetaBoxField`. */
export function password(key: string): StringFieldBuilder<"password"> {
  return new StringFieldBuilder("password", key);
}

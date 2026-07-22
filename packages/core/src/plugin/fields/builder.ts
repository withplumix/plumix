import type { Label } from "../../i18n/label.js";
import type {
  FieldBuilder,
  MetaBoxFieldSpan,
  MetaBoxFieldValidate,
  StringInputType,
  StringMetaBoxField,
} from "../manifest.js";
import type {
  MetaFieldCondition,
  MetaFieldConditionRule,
} from "./condition.js";

export type { StringInputType } from "../manifest.js";

// "heroImage" → "Hero image", "site_title" → "Site title". Derived
// default for fields authored without `.label()`. Shared by every
// fluent builder in this directory.
export function humanizeFieldKey(key: string): string {
  const spaced = key
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll(/[_:-]+/g, " ")
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export interface StringFieldState {
  readonly visibleWhen?: MetaFieldCondition;
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
 * `K` is the literal field key; `V` is the phantom value type the
 * field reads as: `string | undefined` unadorned, narrowed to `string`
 * by `.required()` / `.default()`; `S` is the phantom stored shape —
 * `.required()` narrows it (write-enforced) but `.default()` does not
 * (defaults apply at decode time; storage can still lack the key).
 * Purely type-level — nothing at runtime carries them.
 */
export class StringFieldBuilder<
  Input extends StringInputType = StringInputType,
  K extends string = string,
  V extends string | undefined = string | undefined,
  S extends string | undefined = string | undefined,
> implements FieldBuilder<StringMetaBoxField<Input>> {
  /** Phantom literal key of the field — type-level only, never assigned. */
  declare readonly _key: K;
  /** Phantom read type of the field — type-level only, never assigned. */
  declare readonly _value: V;
  /** Phantom stored shape of the field — type-level only, never assigned. */
  declare readonly _stored: S;

  readonly #inputType: Input;
  readonly #key: string;
  readonly #state: StringFieldState;

  constructor(inputType: Input, key: string, state: StringFieldState = {}) {
    this.#inputType = inputType;
    this.#key = key;
    this.#state = state;
  }

  #fork<V2 extends string | undefined = V, S2 extends string | undefined = S>(
    patch: Partial<StringFieldState>,
  ): StringFieldBuilder<Input, K, V2, S2> {
    return new StringFieldBuilder<Input, K, V2, S2>(
      this.#inputType,
      this.#key,
      {
        ...this.#state,
        ...patch,
      },
    );
  }

  /** Override the derived (humanized-key) label. */
  label(label: Label): StringFieldBuilder<Input, K, V, S> {
    return this.#fork({ label });
  }

  /** Help text rendered under the label. */
  description(description: Label): StringFieldBuilder<Input, K, V, S> {
    return this.#fork({ description });
  }

  placeholder(placeholder: Label): StringFieldBuilder<Input, K, V, S> {
    return this.#fork({ placeholder });
  }

  /** Static adornment rendered before the input. */
  prepend(prepend: Label): StringFieldBuilder<Input, K, V, S> {
    return this.#fork({ prepend });
  }

  /** Static adornment rendered after the input. */
  append(append: Label): StringFieldBuilder<Input, K, V, S> {
    return this.#fork({ append });
  }

  /** Default for absent keys, applied at read decode (and seeded into
   * the admin form) — narrows the read type to `string`; the stored
   * shape stays optional. */
  default(value: string): StringFieldBuilder<Input, K, string, S> {
    return this.#fork<string, S>({ default: value });
  }

  /** Mark the field required — narrows the read and stored types to `string`. */
  required(): StringFieldBuilder<Input, K, string, string> {
    return this.#fork<string, string>({ required: true });
  }

  /**
   * Column span within the box's 12-column grid — a universal layout
   * hint; surfaces that can't honor it (the entry editor rail) ignore it.
   */
  span(span: MetaBoxFieldSpan): StringFieldBuilder<Input, K, V, S> {
    return this.#fork({ span });
  }

  /** Capability gate for this field — see `MetaBoxFieldBase.capability`. */
  capability(capability: string): StringFieldBuilder<Input, K, V, S> {
    return this.#fork({ capability });
  }

  /** Opt this field's value into public REST responses (default-deny). */
  showInApi(): StringFieldBuilder<Input, K, V, S> {
    return this.#fork({ showInApi: true });
  }

  /** Rule factory: this field's value equals `value` — pass the rule
   *  to a dependent field's `.visibleWhen()`. */
  is(value: string): MetaFieldConditionRule {
    return { key: this.#key, op: "eq", value };
  }

  /** Rule factory: this field's value differs from `value`. */
  isNot(value: string): MetaFieldConditionRule {
    return { key: this.#key, op: "neq", value };
  }

  /** Rule factory: this field has no value (unset or cleared). */
  isEmpty(): MetaFieldConditionRule {
    return { key: this.#key, op: "empty" };
  }

  /** Rule factory: this field has a value. */
  isNotEmpty(): MetaFieldConditionRule {
    return { key: this.#key, op: "not_empty" };
  }

  /**
   * Show this field only when every rule passes (one AND group) —
   * rules come from sibling fields' condition factories. Replaces any
   * previously declared condition; `.orVisibleWhen()` adds
   * alternatives.
   */
  visibleWhen(
    ...rules: MetaFieldConditionRule[]
  ): StringFieldBuilder<Input, K, V, S> {
    return this.#fork({ visibleWhen: [rules] });
  }

  /** Add an OR alternative — one more AND group of rules. */
  orVisibleWhen(
    ...rules: MetaFieldConditionRule[]
  ): StringFieldBuilder<Input, K, V, S> {
    return this.#fork({
      visibleWhen: [...(this.#state.visibleWhen ?? []), rules],
    });
  }

  maxLength(maxLength: number): StringFieldBuilder<Input, K, V, S> {
    return this.#fork({ maxLength });
  }

  /** Normalising transform, applied after coercion and before persistence. */
  sanitize(
    sanitize: (value: NonNullable<V>) => NonNullable<V>,
  ): StringFieldBuilder<Input, K, V, S> {
    return this.#fork({ sanitize: sanitize as (value: unknown) => unknown });
  }

  /**
   * Custom validation — `true` for valid, or an i18n-able failure
   * message (sync or async). Runs after `.sanitize()` and the
   * declarative constraints.
   */
  validate(
    validate: (value: NonNullable<V>) => true | Label | Promise<true | Label>,
  ): StringFieldBuilder<Input, K, V, S> {
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
export function text<K extends string>(key: K): StringFieldBuilder<"text", K> {
  return new StringFieldBuilder("text", key);
}

/** Multi-line text input. Storage shape mirrors `text`. */
export function textarea<K extends string>(
  key: K,
): StringFieldBuilder<"textarea", K> {
  return new StringFieldBuilder("textarea", key);
}

/** RFC-5322-shaped email input. */
export function email<K extends string>(
  key: K,
): StringFieldBuilder<"email", K> {
  return new StringFieldBuilder("email", key);
}

/** URL input. */
export function url<K extends string>(key: K): StringFieldBuilder<"url", K> {
  return new StringFieldBuilder("url", key);
}

/** Masked-input password field — see `PasswordMetaBoxField`. */
export function password<K extends string>(
  key: K,
): StringFieldBuilder<"password", K> {
  return new StringFieldBuilder("password", key);
}

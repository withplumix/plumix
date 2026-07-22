import type { Label } from "../../i18n/label.js";
import type {
  FieldBuilder,
  MetaBoxFieldSpan,
  MetaBoxFieldValidate,
  NumberMetaBoxField,
} from "../manifest.js";
import type {
  MetaFieldCondition,
  MetaFieldConditionRule,
} from "./condition.js";
import { humanizeFieldKey } from "./builder.js";

interface NumberFieldState {
  readonly visibleWhen?: MetaFieldCondition;
  readonly label?: Label;
  readonly description?: Label;
  readonly placeholder?: Label;
  readonly default?: number;
  readonly required?: true;
  readonly span?: MetaBoxFieldSpan;
  readonly capability?: string;
  readonly showInApi?: true;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly sanitize?: (value: unknown) => unknown;
  readonly validate?: MetaBoxFieldValidate;
}

/**
 * Fluent chain for the `number` field. Mirrors `StringFieldBuilder` —
 * immutable, phantom-typed (`K` literal key, `V` read type, `S`
 * stored shape). `step` defaults to `1` (integer input) at the
 * renderer when omitted; the definition stays minimal.
 */
export class NumberFieldBuilder<
  K extends string = string,
  V extends number | undefined = number | undefined,
  S extends number | undefined = number | undefined,
> implements FieldBuilder<NumberMetaBoxField> {
  /** Phantom literal key of the field — type-level only, never assigned. */
  declare readonly _key: K;
  /** Phantom read type of the field — type-level only, never assigned. */
  declare readonly _value: V;
  /** Phantom stored shape of the field — type-level only, never assigned. */
  declare readonly _stored: S;

  readonly #key: string;
  readonly #state: NumberFieldState;

  constructor(key: string, state: NumberFieldState = {}) {
    this.#key = key;
    this.#state = state;
  }

  #fork<V2 extends number | undefined = V, S2 extends number | undefined = S>(
    patch: Partial<NumberFieldState>,
  ): NumberFieldBuilder<K, V2, S2> {
    return new NumberFieldBuilder<K, V2, S2>(this.#key, {
      ...this.#state,
      ...patch,
    });
  }

  /** Override the derived (humanized-key) label. */
  label(label: Label): NumberFieldBuilder<K, V, S> {
    return this.#fork({ label });
  }

  /** Help text rendered under the label. */
  description(description: Label): NumberFieldBuilder<K, V, S> {
    return this.#fork({ description });
  }

  placeholder(placeholder: Label): NumberFieldBuilder<K, V, S> {
    return this.#fork({ placeholder });
  }

  /** Default for absent keys, applied at read decode (and seeded into
   * the admin form) — narrows the read type to `number`; the stored
   * shape stays optional. */
  default(value: number): NumberFieldBuilder<K, number, S> {
    return this.#fork<number, S>({ default: value });
  }

  /** Mark the field required — narrows the read and stored types to `number`. */
  required(): NumberFieldBuilder<K, number, number> {
    return this.#fork<number, number>({ required: true });
  }

  /**
   * Column span within the box's 12-column grid — a universal layout
   * hint; surfaces that can't honor it (the entry editor rail) ignore it.
   */
  span(span: MetaBoxFieldSpan): NumberFieldBuilder<K, V, S> {
    return this.#fork({ span });
  }

  /** Capability gate for this field — see `MetaBoxFieldBase.capability`. */
  capability(capability: string): NumberFieldBuilder<K, V, S> {
    return this.#fork({ capability });
  }

  /** Opt this field's value into public REST responses (default-deny). */
  showInApi(): NumberFieldBuilder<K, V, S> {
    return this.#fork({ showInApi: true });
  }

  /** Rule factory: this field's value equals `value` — pass the rule
   *  to a dependent field's `.visibleWhen()`. */
  is(value: number): MetaFieldConditionRule {
    return { key: this.#key, op: "eq", value };
  }

  /** Rule factory: this field's value differs from `value`. */
  isNot(value: number): MetaFieldConditionRule {
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

  /** Rule factory: this field's value is greater than `value`. */
  gt(value: number): MetaFieldConditionRule {
    return { key: this.#key, op: "gt", value };
  }

  /** Rule factory: this field's value is less than `value`. */
  lt(value: number): MetaFieldConditionRule {
    return { key: this.#key, op: "lt", value };
  }

  /**
   * Show this field only when every rule passes (one AND group) —
   * rules come from sibling fields' condition factories. Replaces any
   * previously declared condition; `.orVisibleWhen()` adds
   * alternatives.
   */
  visibleWhen(...rules: MetaFieldConditionRule[]): NumberFieldBuilder<K, V, S> {
    return this.#fork({ visibleWhen: [rules] });
  }

  /** Add an OR alternative — one more AND group of rules. */
  orVisibleWhen(
    ...rules: MetaFieldConditionRule[]
  ): NumberFieldBuilder<K, V, S> {
    return this.#fork({
      visibleWhen: [...(this.#state.visibleWhen ?? []), rules],
    });
  }

  /** Lower bound, enforced client-side by the native number input. */
  min(min: number): NumberFieldBuilder<K, V, S> {
    return this.#fork({ min });
  }

  /** Upper bound, enforced client-side by the native number input. */
  max(max: number): NumberFieldBuilder<K, V, S> {
    return this.#fork({ max });
  }

  step(step: number): NumberFieldBuilder<K, V, S> {
    return this.#fork({ step });
  }

  /** Normalising transform, applied after coercion and before persistence. */
  sanitize(
    sanitize: (value: NonNullable<V>) => NonNullable<V>,
  ): NumberFieldBuilder<K, V, S> {
    return this.#fork({ sanitize: sanitize as (value: unknown) => unknown });
  }

  /**
   * Custom validation — `true` for valid, or an i18n-able failure
   * message (sync or async). Runs after `.sanitize()` and the
   * declarative constraints.
   */
  validate(
    validate: (value: NonNullable<V>) => true | Label | Promise<true | Label>,
  ): NumberFieldBuilder<K, V, S> {
    return this.#fork({ validate: validate as MetaBoxFieldValidate });
  }

  /** Compile the chain into the wire/manifest field definition. */
  build(): NumberMetaBoxField {
    return {
      ...this.#state,
      key: this.#key,
      label: this.#state.label ?? humanizeFieldKey(this.#key),
      type: "number",
      inputType: "number",
    };
  }
}

/** Numeric input with optional `.min()` / `.max()` / `.step()` bounds. */
export function number<K extends string>(key: K): NumberFieldBuilder<K> {
  return new NumberFieldBuilder(key);
}

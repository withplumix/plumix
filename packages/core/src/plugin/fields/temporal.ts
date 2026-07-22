import type { Label } from "../../i18n/label.js";
import type {
  FieldBuilder,
  MetaBoxFieldSpan,
  MetaBoxFieldValidate,
  TemporalInputType,
  TemporalMetaBoxField,
} from "../manifest.js";
import type {
  MetaFieldCondition,
  MetaFieldConditionRule,
} from "./condition.js";
import { isValidTemporalValue } from "../manifest.js";
import { humanizeFieldKey } from "./builder.js";
import { FieldConfigError } from "./errors.js";

export type { TemporalInputType } from "../manifest.js";

/** Read type after `.returns("date")` — optionality carries over from `V`. */
type ProjectedDate<V> = undefined extends V ? Date | undefined : Date;

interface TemporalFieldState {
  readonly visibleWhen?: MetaFieldCondition;
  readonly label?: Label;
  readonly description?: Label;
  readonly default?: string;
  readonly required?: true;
  readonly span?: MetaBoxFieldSpan;
  readonly capability?: string;
  readonly showInApi?: true;
  readonly min?: string;
  readonly max?: string;
  readonly returns?: "date";
  readonly sanitize?: (value: unknown) => unknown;
  readonly validate?: MetaBoxFieldValidate;
}

/**
 * Fluent chain for the temporal fields (`date`, `datetime`, `time`).
 * Storage is always the ISO-shaped string the native input produces —
 * the phantom stored shape `S` stays a string even when
 * `.returns("date")` projects the read type `V` to a JS `Date` at
 * decode time. `.sanitize()` / `.validate()` run on the write side,
 * so their callbacks always see the stored string regardless of the
 * read projection.
 */
export class TemporalFieldBuilder<
  Input extends TemporalInputType = TemporalInputType,
  K extends string = string,
  V extends string | Date | undefined = string | undefined,
  S extends string | undefined = string | undefined,
> implements FieldBuilder<TemporalMetaBoxField<Input>> {
  /** Phantom literal key of the field — type-level only, never assigned. */
  declare readonly _key: K;
  /** Phantom read type of the field — type-level only, never assigned. */
  declare readonly _value: V;
  /** Phantom stored shape of the field — type-level only, never assigned. */
  declare readonly _stored: S;

  readonly #inputType: Input;
  readonly #key: string;
  readonly #state: TemporalFieldState;

  constructor(inputType: Input, key: string, state: TemporalFieldState = {}) {
    this.#inputType = inputType;
    this.#key = key;
    this.#state = state;
  }

  #fork<
    V2 extends string | Date | undefined = V,
    S2 extends string | undefined = S,
  >(
    patch: Partial<TemporalFieldState>,
  ): TemporalFieldBuilder<Input, K, V2, S2> {
    return new TemporalFieldBuilder<Input, K, V2, S2>(
      this.#inputType,
      this.#key,
      {
        ...this.#state,
        ...patch,
      },
    );
  }

  /** Override the derived (humanized-key) label. */
  label(label: Label): TemporalFieldBuilder<Input, K, V, S> {
    return this.#fork({ label });
  }

  /** Help text rendered under the label. */
  description(description: Label): TemporalFieldBuilder<Input, K, V, S> {
    return this.#fork({ description });
  }

  /**
   * Default for absent keys — an ISO string in the field's stored
   * shape, applied at read decode (and seeded into the admin form).
   * Narrows the read type to non-optional; the stored shape stays
   * optional.
   */
  default(value: string): TemporalFieldBuilder<Input, K, NonNullable<V>, S> {
    return this.#fork<NonNullable<V>, S>({ default: value });
  }

  /** Mark the field required — narrows the read and stored types to non-optional. */
  required(): TemporalFieldBuilder<Input, K, NonNullable<V>, string> {
    return this.#fork<NonNullable<V>, string>({ required: true });
  }

  /**
   * Column span within the box's 12-column grid — a universal layout
   * hint; surfaces that can't honor it (the entry editor rail) ignore it.
   */
  span(span: MetaBoxFieldSpan): TemporalFieldBuilder<Input, K, V, S> {
    return this.#fork({ span });
  }

  /** Capability gate for this field — see `MetaBoxFieldBase.capability`. */
  capability(capability: string): TemporalFieldBuilder<Input, K, V, S> {
    return this.#fork({ capability });
  }

  /** Opt this field's value into public REST responses (default-deny). */
  showInApi(): TemporalFieldBuilder<Input, K, V, S> {
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
  ): TemporalFieldBuilder<Input, K, V, S> {
    return this.#fork({ visibleWhen: [rules] });
  }

  /** Add an OR alternative — one more AND group of rules. */
  orVisibleWhen(
    ...rules: MetaFieldConditionRule[]
  ): TemporalFieldBuilder<Input, K, V, S> {
    return this.#fork({
      visibleWhen: [...(this.#state.visibleWhen ?? []), rules],
    });
  }

  /** Lower bound in the field's stored ISO shape, enforced by the constraint walker. */
  min(min: string): TemporalFieldBuilder<Input, K, V, S> {
    return this.#fork({ min });
  }

  /** Upper bound in the field's stored ISO shape, enforced by the constraint walker. */
  max(max: string): TemporalFieldBuilder<Input, K, V, S> {
    return this.#fork({ max });
  }

  /**
   * Project reads to a JS `Date` at decode time — the read type
   * follows; storage remains the ISO string. Wall-clock components
   * anchor to UTC (`date` at UTC midnight, `time` on 1970-01-01 UTC)
   * so they survive any server/browser timezone split — read them
   * back with `getUTC*` or `timeZone: "UTC"` formatting. `Date`
   * values written back encode from UTC components symmetrically.
   */
  returns(shape: "date"): TemporalFieldBuilder<Input, K, ProjectedDate<V>, S> {
    return this.#fork<ProjectedDate<V>, S>({ returns: shape });
  }

  /**
   * Normalising transform, applied after coercion and before
   * persistence. Always receives the stored ISO string — the
   * `.returns("date")` projection is read-side only.
   */
  sanitize(
    sanitize: (value: string) => string,
  ): TemporalFieldBuilder<Input, K, V, S> {
    return this.#fork({ sanitize: sanitize as (value: unknown) => unknown });
  }

  /**
   * Custom validation — `true` for valid, or an i18n-able failure
   * message (sync or async). Runs after `.sanitize()` on the stored
   * ISO string.
   */
  validate(
    validate: (value: string) => true | Label | Promise<true | Label>,
  ): TemporalFieldBuilder<Input, K, V, S> {
    return this.#fork({ validate: validate as MetaBoxFieldValidate });
  }

  /** Compile the chain into the wire/manifest field definition. */
  build(): TemporalMetaBoxField<Input> {
    // A typo'd bound would otherwise silently reject every write —
    // bounds compare lexicographically against the stored shape, so a
    // malformed one sorts nonsensically. Fail loudly at registration.
    for (const bound of ["min", "max"] as const) {
      const value = this.#state[bound];
      if (
        value !== undefined &&
        !isValidTemporalValue(this.#inputType, value)
      ) {
        throw FieldConfigError.temporalBoundInvalid({
          fieldKey: this.#key,
          bound,
          value,
        });
      }
    }
    return {
      ...this.#state,
      key: this.#key,
      label: this.#state.label ?? humanizeFieldKey(this.#key),
      type: "string",
      inputType: this.#inputType,
    };
  }
}

/**
 * Date-only field, stored as `YYYY-MM-DD`. Renders as a native
 * `<input type="date">` in the admin. `.returns("date")` reads a JS
 * `Date` instead of the ISO string.
 */
export function date<K extends string>(
  key: K,
): TemporalFieldBuilder<"date", K> {
  return new TemporalFieldBuilder("date", key);
}

/**
 * Date + time field, stored as `YYYY-MM-DDTHH:MM` (optional `:SS`) —
 * naive local time from `<input type="datetime-local">`.
 */
export function datetime<K extends string>(
  key: K,
): TemporalFieldBuilder<"datetime", K> {
  return new TemporalFieldBuilder("datetime", key);
}

/**
 * Time-only field, stored as `HH:MM` (optional `:SS`). Combine with a
 * `date` field when both are needed.
 */
export function time<K extends string>(
  key: K,
): TemporalFieldBuilder<"time", K> {
  return new TemporalFieldBuilder("time", key);
}

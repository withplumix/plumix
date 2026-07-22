import type { Label } from "../../i18n/label.js";
import type {
  FieldBuilder,
  MetaBoxFieldSpan,
  MetaBoxFieldValidate,
  RangeMetaBoxField,
} from "../manifest.js";
import { humanizeFieldKey } from "./builder.js";
import { FieldConfigError } from "./errors.js";

interface RangeFieldState {
  readonly label?: Label;
  readonly description?: Label;
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
 * Fluent chain for the `range` slider field. Both `.min()` and
 * `.max()` are required — enforced when the chain compiles at
 * registration, along with `min <= max`. `build()` injects a default
 * sanitizer that rejects values outside `[min, max]` on write; a
 * custom `.sanitize()` replaces it entirely.
 */
export class RangeFieldBuilder<
  K extends string = string,
  V extends number | undefined = number | undefined,
  S extends number | undefined = number | undefined,
> implements FieldBuilder<RangeMetaBoxField> {
  /** Phantom literal key of the field — type-level only, never assigned. */
  declare readonly _key: K;
  /** Phantom read type of the field — type-level only, never assigned. */
  declare readonly _value: V;
  /** Phantom stored shape of the field — type-level only, never assigned. */
  declare readonly _stored: S;

  readonly #key: string;
  readonly #state: RangeFieldState;

  constructor(key: string, state: RangeFieldState = {}) {
    this.#key = key;
    this.#state = state;
  }

  #fork<V2 extends number | undefined = V, S2 extends number | undefined = S>(
    patch: Partial<RangeFieldState>,
  ): RangeFieldBuilder<K, V2, S2> {
    return new RangeFieldBuilder<K, V2, S2>(this.#key, {
      ...this.#state,
      ...patch,
    });
  }

  /** Override the derived (humanized-key) label. */
  label(label: Label): RangeFieldBuilder<K, V, S> {
    return this.#fork({ label });
  }

  /** Help text rendered under the label. */
  description(description: Label): RangeFieldBuilder<K, V, S> {
    return this.#fork({ description });
  }

  /** Default for absent keys, applied at read decode (and seeded into
   * the admin form) — narrows the read type to `number`; the stored
   * shape stays optional. */
  default(value: number): RangeFieldBuilder<K, number, S> {
    return this.#fork<number, S>({ default: value });
  }

  /** Mark the field required — narrows the read and stored types to `number`. */
  required(): RangeFieldBuilder<K, number, number> {
    return this.#fork<number, number>({ required: true });
  }

  /**
   * Column span within the box's 12-column grid — a universal layout
   * hint; surfaces that can't honor it (the entry editor rail) ignore it.
   */
  span(span: MetaBoxFieldSpan): RangeFieldBuilder<K, V, S> {
    return this.#fork({ span });
  }

  /** Capability gate for this field — see `MetaBoxFieldBase.capability`. */
  capability(capability: string): RangeFieldBuilder<K, V, S> {
    return this.#fork({ capability });
  }

  /** Opt this field's value into public REST responses (default-deny). */
  showInApi(): RangeFieldBuilder<K, V, S> {
    return this.#fork({ showInApi: true });
  }

  /** Slider lower bound. Required — `build()` throws without it. */
  min(min: number): RangeFieldBuilder<K, V, S> {
    return this.#fork({ min });
  }

  /** Slider upper bound. Required — `build()` throws without it. */
  max(max: number): RangeFieldBuilder<K, V, S> {
    return this.#fork({ max });
  }

  step(step: number): RangeFieldBuilder<K, V, S> {
    return this.#fork({ step });
  }

  /** Normalising transform — replaces the default bounds sanitizer. */
  sanitize(
    sanitize: (value: NonNullable<V>) => NonNullable<V>,
  ): RangeFieldBuilder<K, V, S> {
    return this.#fork({ sanitize: sanitize as (value: unknown) => unknown });
  }

  /**
   * Custom validation — `true` for valid, or an i18n-able failure
   * message (sync or async). Runs after `.sanitize()` and the
   * declarative constraints.
   */
  validate(
    validate: (value: NonNullable<V>) => true | Label | Promise<true | Label>,
  ): RangeFieldBuilder<K, V, S> {
    return this.#fork({ validate: validate as MetaBoxFieldValidate });
  }

  /** Compile the chain into the wire/manifest field definition. */
  build(): RangeMetaBoxField {
    const { min, max } = this.#state;
    if (min === undefined || max === undefined) {
      throw FieldConfigError.rangeMissingBounds({ fieldKey: this.#key });
    }
    if (min > max) {
      throw FieldConfigError.rangeMinGreaterThanMax({
        fieldKey: this.#key,
        min,
        max,
      });
    }
    return {
      ...this.#state,
      key: this.#key,
      label: this.#state.label ?? humanizeFieldKey(this.#key),
      type: "number",
      inputType: "range",
      min,
      max,
      sanitize: this.#state.sanitize ?? buildBoundsSanitizer(min, max),
    };
  }
}

/**
 * Bounded numeric slider. `.min()` and `.max()` are required;
 * `min <= max` is enforced at registration time.
 */
export function range<K extends string>(key: K): RangeFieldBuilder<K> {
  return new RangeFieldBuilder(key);
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

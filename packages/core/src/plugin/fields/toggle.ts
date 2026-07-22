import type { Label } from "../../i18n/label.js";
import type {
  FieldBuilder,
  MetaBoxFieldSpan,
  MetaBoxFieldValidate,
  ToggleMetaBoxField,
} from "../manifest.js";
import { humanizeFieldKey } from "./builder.js";

interface ToggleFieldState {
  readonly onText?: Label;
  readonly offText?: Label;
  readonly label?: Label;
  readonly description?: Label;
  readonly default?: boolean;
  readonly required?: true;
  readonly span?: MetaBoxFieldSpan;
  readonly capability?: string;
  readonly showInApi?: true;
  readonly sanitize?: (value: unknown) => unknown;
  readonly validate?: MetaBoxFieldValidate;
}

/**
 * Fluent chain for the boolean switch field. Immutable — every call
 * returns a fresh instance, so a shared base chain can be forked
 * without aliasing. `V` is the phantom read type: `boolean |
 * undefined` unadorned, narrowed to `boolean` by `.required()` /
 * `.default()`. Purely type-level — nothing at runtime carries it.
 */
export class ToggleFieldBuilder<
  K extends string = string,
  V extends boolean | undefined = boolean | undefined,
  S extends boolean | undefined = boolean | undefined,
> implements FieldBuilder<ToggleMetaBoxField> {
  /** Phantom literal key of the field — type-level only, never assigned. */
  declare readonly _key: K;
  /** Phantom read type of the field — type-level only, never assigned. */
  declare readonly _value: V;
  /** Phantom stored shape — `.required()` narrows it (write-enforced);
   *  `.default()` does not (defaults apply at decode time). */
  declare readonly _stored: S;

  readonly #key: K;
  readonly #state: ToggleFieldState;

  constructor(key: K, state: ToggleFieldState = {}) {
    this.#key = key;
    this.#state = state;
  }

  #fork<V2 extends boolean | undefined = V, S2 extends boolean | undefined = S>(
    patch: Partial<ToggleFieldState>,
  ): ToggleFieldBuilder<K, V2, S2> {
    return new ToggleFieldBuilder<K, V2, S2>(this.#key, {
      ...this.#state,
      ...patch,
    });
  }

  /** Label shown beside the switch while it is on. */
  onText(onText: Label): ToggleFieldBuilder<K, V, S> {
    return this.#fork({ onText });
  }

  /** Label shown beside the switch while it is off. */
  offText(offText: Label): ToggleFieldBuilder<K, V, S> {
    return this.#fork({ offText });
  }

  /** Override the derived (humanized-key) label. */
  label(label: Label): ToggleFieldBuilder<K, V, S> {
    return this.#fork({ label });
  }

  /** Help text rendered under the label. */
  description(description: Label): ToggleFieldBuilder<K, V, S> {
    return this.#fork({ description });
  }

  /** Admin-form prefill for unsaved keys — narrows the read type to `boolean`. */
  default(value: boolean): ToggleFieldBuilder<K, boolean, S> {
    return this.#fork<boolean, S>({ default: value });
  }

  /** Mark the field required — narrows the read type to `boolean`. */
  required(): ToggleFieldBuilder<K, boolean, boolean> {
    return this.#fork<boolean, boolean>({ required: true });
  }

  /**
   * Column span within the box's 12-column grid — a universal layout
   * hint; surfaces that can't honor it (the entry editor rail) ignore it.
   */
  span(span: MetaBoxFieldSpan): ToggleFieldBuilder<K, V, S> {
    return this.#fork({ span });
  }

  /** Capability gate for this field — see `MetaBoxFieldBase.capability`. */
  capability(capability: string): ToggleFieldBuilder<K, V, S> {
    return this.#fork({ capability });
  }

  /** Opt this field's value into public REST responses (default-deny). */
  showInApi(): ToggleFieldBuilder<K, V, S> {
    return this.#fork({ showInApi: true });
  }

  /** Normalising transform, applied after coercion and before persistence. */
  sanitize(
    sanitize: (value: NonNullable<V>) => NonNullable<V>,
  ): ToggleFieldBuilder<K, V, S> {
    return this.#fork({ sanitize: sanitize as (value: unknown) => unknown });
  }

  /**
   * Custom validation — `true` for valid, or an i18n-able failure
   * message (sync or async). Runs after `.sanitize()` and the
   * declarative constraints.
   */
  validate(
    validate: (value: NonNullable<V>) => true | Label | Promise<true | Label>,
  ): ToggleFieldBuilder<K, V, S> {
    return this.#fork({ validate: validate as MetaBoxFieldValidate });
  }

  /** Compile the chain into the wire/manifest field definition. */
  build(): ToggleMetaBoxField {
    return {
      ...this.#state,
      key: this.#key,
      label: this.#state.label ?? humanizeFieldKey(this.#key),
      type: "boolean",
      inputType: "toggle",
    };
  }
}

/**
 * Boolean switch field — `toggle("featured").onText("Yes").offText("No")`.
 * Reads as `boolean | undefined`, narrowed by `.required()` /
 * `.default()`.
 */
export function toggle<K extends string>(key: K): ToggleFieldBuilder<K> {
  return new ToggleFieldBuilder(key);
}

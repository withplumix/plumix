import type { Label } from "../../i18n/label.js";
import type {
  ColorMetaBoxField,
  FieldBuilder,
  MetaBoxFieldSpan,
  MetaBoxFieldValidate,
} from "../manifest.js";
import { humanizeFieldKey } from "./builder.js";

interface ColorFieldState {
  readonly label?: Label;
  readonly description?: Label;
  readonly default?: string;
  readonly required?: true;
  readonly span?: MetaBoxFieldSpan;
  readonly capability?: string;
  readonly showInApi?: true;
  readonly sanitize?: (value: unknown) => unknown;
  readonly validate?: MetaBoxFieldValidate;
}

export const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Fluent chain for the `color` field. Storage is the hex string the
 * native `<input type="color">` produces (`#rrggbb`). The constraint
 * walker enforces the hex shape (and lowercases) server-side — a
 * custom `.sanitize()` transforms but can never bypass that gate.
 */
export class ColorFieldBuilder<
  K extends string = string,
  V extends string | undefined = string | undefined,
  S extends string | undefined = string | undefined,
> implements FieldBuilder<ColorMetaBoxField> {
  /** Phantom literal key of the field — type-level only, never assigned. */
  declare readonly _key: K;
  /** Phantom read type of the field — type-level only, never assigned. */
  declare readonly _value: V;
  /** Phantom stored shape of the field — type-level only, never assigned. */
  declare readonly _stored: S;

  readonly #key: string;
  readonly #state: ColorFieldState;

  constructor(key: string, state: ColorFieldState = {}) {
    this.#key = key;
    this.#state = state;
  }

  #fork<V2 extends string | undefined = V, S2 extends string | undefined = S>(
    patch: Partial<ColorFieldState>,
  ): ColorFieldBuilder<K, V2, S2> {
    return new ColorFieldBuilder<K, V2, S2>(this.#key, {
      ...this.#state,
      ...patch,
    });
  }

  /** Override the derived (humanized-key) label. */
  label(label: Label): ColorFieldBuilder<K, V, S> {
    return this.#fork({ label });
  }

  /** Help text rendered under the label. */
  description(description: Label): ColorFieldBuilder<K, V, S> {
    return this.#fork({ description });
  }

  /**
   * Default for absent keys — a hex string `#xxxxxx` (or `#xxx`
   * shorthand), applied at read decode (and seeded into the admin
   * form). Narrows the read type to `string`; the stored shape stays
   * optional.
   */
  default(value: string): ColorFieldBuilder<K, string, S> {
    return this.#fork<string, S>({ default: value });
  }

  /** Mark the field required — narrows the read and stored types to `string`. */
  required(): ColorFieldBuilder<K, string, string> {
    return this.#fork<string, string>({ required: true });
  }

  /**
   * Column span within the box's 12-column grid — a universal layout
   * hint; surfaces that can't honor it (the entry editor rail) ignore it.
   */
  span(span: MetaBoxFieldSpan): ColorFieldBuilder<K, V, S> {
    return this.#fork({ span });
  }

  /** Capability gate for this field — see `MetaBoxFieldBase.capability`. */
  capability(capability: string): ColorFieldBuilder<K, V, S> {
    return this.#fork({ capability });
  }

  /** Opt this field's value into public REST responses (default-deny). */
  showInApi(): ColorFieldBuilder<K, V, S> {
    return this.#fork({ showInApi: true });
  }

  /** Normalising transform, applied after coercion and before persistence. */
  sanitize(
    sanitize: (value: NonNullable<V>) => NonNullable<V>,
  ): ColorFieldBuilder<K, V, S> {
    return this.#fork({ sanitize: sanitize as (value: unknown) => unknown });
  }

  /**
   * Custom validation — `true` for valid, or an i18n-able failure
   * message (sync or async). Runs after `.sanitize()` and the
   * declarative constraints.
   */
  validate(
    validate: (value: NonNullable<V>) => true | Label | Promise<true | Label>,
  ): ColorFieldBuilder<K, V, S> {
    return this.#fork({ validate: validate as MetaBoxFieldValidate });
  }

  /** Compile the chain into the wire/manifest field definition. */
  build(): ColorMetaBoxField {
    return {
      ...this.#state,
      key: this.#key,
      label: this.#state.label ?? humanizeFieldKey(this.#key),
      type: "string",
      inputType: "color",
    };
  }
}

/** Hex color picker storing the `#rrggbb` string the native input
 *  produces. The hex format is enforced (and the value lowercased)
 *  server-side by the constraint walker. */
export function color<K extends string>(key: K): ColorFieldBuilder<K> {
  return new ColorFieldBuilder(key);
}

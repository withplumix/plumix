import type { Label } from "../../i18n/label.js";
import type {
  FieldBuilder,
  JsonMetaBoxField,
  MetaBoxFieldSpan,
  MetaBoxFieldValidate,
} from "../manifest.js";
import { humanizeFieldKey } from "./builder.js";

interface JsonFieldState {
  readonly label?: Label;
  readonly description?: Label;
  readonly default?: unknown;
  readonly required?: true;
  readonly span?: MetaBoxFieldSpan;
  readonly capability?: string;
  readonly showInApi?: true;
  readonly sanitize?: (value: unknown) => unknown;
  readonly validate?: MetaBoxFieldValidate;
}

/**
 * Fluent chain for the free-form `json` field. Storage round-trips
 * through `JSON.stringify` so any value that survives serialisation
 * survives the wire. Values read and store as `unknown` — the field
 * carries no schema for the type layer to narrow.
 */
export class JsonFieldBuilder<
  K extends string = string,
> implements FieldBuilder<JsonMetaBoxField> {
  /** Phantom literal key of the field — type-level only, never assigned. */
  declare readonly _key: K;
  /** Phantom read type of the field — type-level only, never assigned. */
  declare readonly _value: unknown;
  /** Phantom stored shape of the field — type-level only, never assigned. */
  declare readonly _stored: unknown;

  readonly #key: string;
  readonly #state: JsonFieldState;

  constructor(key: string, state: JsonFieldState = {}) {
    this.#key = key;
    this.#state = state;
  }

  #fork(patch: Partial<JsonFieldState>): JsonFieldBuilder<K> {
    return new JsonFieldBuilder<K>(this.#key, {
      ...this.#state,
      ...patch,
    });
  }

  /** Override the derived (humanized-key) label. */
  label(label: Label): JsonFieldBuilder<K> {
    return this.#fork({ label });
  }

  /** Help text rendered under the label. */
  description(description: Label): JsonFieldBuilder<K> {
    return this.#fork({ description });
  }

  /** Default for absent keys — any JSON-serialisable value, applied at
   * read decode (and seeded into the admin form). */
  default(value: unknown): JsonFieldBuilder<K> {
    return this.#fork({ default: value });
  }

  /** Mark the field required. */
  required(): JsonFieldBuilder<K> {
    return this.#fork({ required: true });
  }

  /**
   * Column span within the box's 12-column grid — a universal layout
   * hint; surfaces that can't honor it (the entry editor rail) ignore it.
   */
  span(span: MetaBoxFieldSpan): JsonFieldBuilder<K> {
    return this.#fork({ span });
  }

  /** Capability gate for this field — see `MetaBoxFieldBase.capability`. */
  capability(capability: string): JsonFieldBuilder<K> {
    return this.#fork({ capability });
  }

  /** Opt this field's value into public REST responses (default-deny). */
  showInApi(): JsonFieldBuilder<K> {
    return this.#fork({ showInApi: true });
  }

  /** Normalising transform, applied after coercion and before persistence. */
  sanitize(sanitize: (value: unknown) => unknown): JsonFieldBuilder<K> {
    return this.#fork({ sanitize });
  }

  /**
   * Custom validation — `true` for valid, or an i18n-able failure
   * message (sync or async). Runs after `.sanitize()` and the
   * declarative constraints.
   */
  validate(
    validate: (value: unknown) => true | Label | Promise<true | Label>,
  ): JsonFieldBuilder<K> {
    return this.#fork({ validate });
  }

  /** Compile the chain into the wire/manifest field definition. */
  build(): JsonMetaBoxField {
    return {
      ...this.#state,
      key: this.#key,
      label: this.#state.label ?? humanizeFieldKey(this.#key),
      type: "json",
      inputType: "json",
    };
  }
}

/** Free-form JSON value round-tripping through the JSON serializer. */
export function json<K extends string>(key: K): JsonFieldBuilder<K> {
  return new JsonFieldBuilder(key);
}

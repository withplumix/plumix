import type { Label } from "../../i18n/label.js";
import type {
  FieldBuilder,
  MetaBoxFieldSpan,
  MetaBoxFieldValidate,
  RichtextMetaBoxField,
} from "../manifest.js";
import { humanizeFieldKey } from "./builder.js";

interface RichtextFieldState {
  readonly label?: Label;
  readonly description?: Label;
  readonly default?: unknown;
  readonly required?: true;
  readonly span?: MetaBoxFieldSpan;
  readonly capability?: string;
  readonly showInApi?: true;
  readonly marks?: readonly string[];
  readonly nodes?: readonly string[];
  readonly blocks?: readonly string[];
  readonly validate?: MetaBoxFieldValidate;
}

/**
 * Fluent chain for the `richtext` field. Storage is Tiptap's
 * ProseMirror JSON shape, round-tripped through the `json` storage
 * primitive. The constraint walker rejects nodes/marks/blocks outside
 * the allowlist (and unsafe link hrefs) server-side — there is
 * deliberately no `.sanitize()` on this chain, so a custom callback
 * can never bypass that enforcement.
 */
export class RichtextFieldBuilder<
  K extends string = string,
> implements FieldBuilder<RichtextMetaBoxField> {
  /** Phantom literal key of the field — type-level only, never assigned. */
  declare readonly _key: K;
  /** Phantom read type of the field — type-level only, never assigned. */
  declare readonly _value: unknown;
  /** Phantom stored shape of the field — type-level only, never assigned. */
  declare readonly _stored: unknown;

  readonly #key: string;
  readonly #state: RichtextFieldState;

  constructor(key: string, state: RichtextFieldState = {}) {
    this.#key = key;
    this.#state = state;
  }

  #fork(patch: Partial<RichtextFieldState>): RichtextFieldBuilder<K> {
    return new RichtextFieldBuilder<K>(this.#key, {
      ...this.#state,
      ...patch,
    });
  }

  /** Override the derived (humanized-key) label. */
  label(label: Label): RichtextFieldBuilder<K> {
    return this.#fork({ label });
  }

  /** Help text rendered under the label. */
  description(description: Label): RichtextFieldBuilder<K> {
    return this.#fork({ description });
  }

  /** Default for absent keys — a ProseMirror doc JSON value, applied
   * at read decode (and seeded into the admin form). */
  default(value: unknown): RichtextFieldBuilder<K> {
    return this.#fork({ default: value });
  }

  /** Mark the field required. */
  required(): RichtextFieldBuilder<K> {
    return this.#fork({ required: true });
  }

  /**
   * Column span within the box's 12-column grid — a universal layout
   * hint; surfaces that can't honor it (the entry editor rail) ignore it.
   */
  span(span: MetaBoxFieldSpan): RichtextFieldBuilder<K> {
    return this.#fork({ span });
  }

  /** Capability gate for this field — see `MetaBoxFieldBase.capability`. */
  capability(capability: string): RichtextFieldBuilder<K> {
    return this.#fork({ capability });
  }

  /** Opt this field's value into public REST responses (default-deny). */
  showInApi(): RichtextFieldBuilder<K> {
    return this.#fork({ showInApi: true });
  }

  /** Mark allowlist (`bold`, `italic`, `link`, …). Omitted = deny all. */
  marks(marks: readonly string[]): RichtextFieldBuilder<K> {
    return this.#fork({ marks });
  }

  /** Node allowlist (`heading`, `bulletList`, …). Omitted = deny all but doc/paragraph/text. */
  nodes(nodes: readonly string[]): RichtextFieldBuilder<K> {
    return this.#fork({ nodes });
  }

  /** Embedded-block allowlist. Omitted = deny all. */
  blocks(blocks: readonly string[]): RichtextFieldBuilder<K> {
    return this.#fork({ blocks });
  }

  /**
   * Custom validation — `true` for valid, or an i18n-able failure
   * message (sync or async). Runs after the injected allowlist walker.
   */
  validate(
    validate: (value: unknown) => true | Label | Promise<true | Label>,
  ): RichtextFieldBuilder<K> {
    return this.#fork({ validate });
  }

  /** Compile the chain into the wire/manifest field definition. */
  build(): RichtextMetaBoxField {
    return {
      ...this.#state,
      key: this.#key,
      label: this.#state.label ?? humanizeFieldKey(this.#key),
      type: "json",
      inputType: "richtext",
    };
  }
}

/**
 * Rich text stored as ProseMirror JSON, constrained by the
 * `.marks()` / `.nodes()` / `.blocks()` allowlists.
 */
export function richtext<K extends string>(key: K): RichtextFieldBuilder<K> {
  return new RichtextFieldBuilder(key);
}

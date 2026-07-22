import type { Label } from "../../i18n/label.js";
import type {
  FieldBuilder,
  LinkMetaBoxField,
  LinkValue,
  MetaBoxFieldSpan,
  MetaBoxFieldValidate,
} from "../manifest.js";
import type { StringFieldState } from "./builder.js";
import { humanizeFieldKey } from "./builder.js";
import { SAFE_HREF_RE } from "./richtext-validate.js";

export type { LinkValue } from "../manifest.js";

type LinkFieldState = Omit<StringFieldState, "default" | "maxLength"> & {
  readonly default?: LinkValue;
};

/**
 * Fluent chain for the `link` field — see `StringFieldBuilder` for the
 * chassis conventions (immutability, phantom `K`/`V`/`S`, `build()`
 * seam). `V` is `LinkValue | undefined` unadorned, narrowed to
 * `LinkValue` by `.required()` / `.default()`; `S` is the stored shape,
 * narrowed by `.required()` only (defaults apply at decode time).
 */
export class LinkFieldBuilder<
  K extends string = string,
  V extends LinkValue | undefined = LinkValue | undefined,
  S extends LinkValue | undefined = LinkValue | undefined,
> implements FieldBuilder<LinkMetaBoxField> {
  /** Phantom literal key of the field — type-level only, never assigned. */
  declare readonly _key: K;
  /** Phantom read type of the field — type-level only, never assigned. */
  declare readonly _value: V;
  /** Phantom stored shape of the field — type-level only, never assigned. */
  declare readonly _stored: S;

  readonly #key: string;
  readonly #state: LinkFieldState;

  constructor(key: string, state: LinkFieldState = {}) {
    this.#key = key;
    this.#state = state;
  }

  #fork<
    V2 extends LinkValue | undefined = V,
    S2 extends LinkValue | undefined = S,
  >(patch: Partial<LinkFieldState>): LinkFieldBuilder<K, V2, S2> {
    return new LinkFieldBuilder<K, V2, S2>(this.#key, {
      ...this.#state,
      ...patch,
    });
  }

  /** Override the derived (humanized-key) label. */
  label(label: Label): LinkFieldBuilder<K, V, S> {
    return this.#fork({ label });
  }

  /** Help text rendered under the label. */
  description(description: Label): LinkFieldBuilder<K, V, S> {
    return this.#fork({ description });
  }

  /** Placeholder for the control's URL input. */
  placeholder(placeholder: Label): LinkFieldBuilder<K, V, S> {
    return this.#fork({ placeholder });
  }

  /** Static adornment rendered before the input. */
  prepend(prepend: Label): LinkFieldBuilder<K, V, S> {
    return this.#fork({ prepend });
  }

  /** Static adornment rendered after the input. */
  append(append: Label): LinkFieldBuilder<K, V, S> {
    return this.#fork({ append });
  }

  /** Default for absent keys, applied at read decode (and seeded into
   * the admin form) — narrows the read type to `LinkValue`; the stored
   * shape stays optional. */
  default(value: LinkValue): LinkFieldBuilder<K, LinkValue, S> {
    return this.#fork<LinkValue, S>({ default: value });
  }

  /** Mark the field required — narrows the read and stored types to `LinkValue`. */
  required(): LinkFieldBuilder<K, LinkValue, LinkValue> {
    return this.#fork<LinkValue, LinkValue>({ required: true });
  }

  /**
   * Column span within the box's 12-column grid — a universal layout
   * hint; surfaces that can't honor it (the entry editor rail) ignore it.
   */
  span(span: MetaBoxFieldSpan): LinkFieldBuilder<K, V, S> {
    return this.#fork({ span });
  }

  /** Capability gate for this field — see `MetaBoxFieldBase.capability`. */
  capability(capability: string): LinkFieldBuilder<K, V, S> {
    return this.#fork({ capability });
  }

  /** Opt this field's value into public REST responses (default-deny). */
  showInApi(): LinkFieldBuilder<K, V, S> {
    return this.#fork({ showInApi: true });
  }

  /**
   * Normalising transform, applied after the built-in shape/URL
   * validation and before persistence.
   */
  sanitize(
    sanitize: (value: NonNullable<V>) => NonNullable<V>,
  ): LinkFieldBuilder<K, V, S> {
    return this.#fork({ sanitize: sanitize as (value: unknown) => unknown });
  }

  /**
   * Custom validation — `true` for valid, or an i18n-able failure
   * message (sync or async). Runs after `.sanitize()` and the
   * declarative constraints.
   */
  validate(
    validate: (value: NonNullable<V>) => true | Label | Promise<true | Label>,
  ): LinkFieldBuilder<K, V, S> {
    return this.#fork({ validate: validate as MetaBoxFieldValidate });
  }

  /** Compile the chain into the wire/manifest field definition. */
  build(): LinkMetaBoxField {
    const { sanitize, ...state } = this.#state;
    return {
      ...state,
      key: this.#key,
      label: state.label ?? humanizeFieldKey(this.#key),
      type: "json",
      inputType: "link",
      // The built-in shape/URL check always runs first so a chained
      // `.sanitize()` callback can trust its typed `LinkValue` parameter.
      sanitize: (value) => {
        const coerced = coerceLinkValue(value);
        return sanitize ? sanitize(coerced) : coerced;
      },
    };
  }
}

/** CTA-style link field — internal entry URL or external URL, optional label + new-tab. */
export function link<K extends string>(key: K): LinkFieldBuilder<K> {
  return new LinkFieldBuilder(key);
}

function coerceLinkValue(value: unknown): LinkValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidLink();
  }
  const { url, label, newTab } = value as Record<string, unknown>;
  if (typeof url !== "string" || !isValidLinkUrl(url)) throw invalidLink();
  if (label !== undefined && typeof label !== "string") throw invalidLink();
  if (newTab !== undefined && typeof newTab !== "boolean") throw invalidLink();
  // Rebuild from the known keys so unrecognized properties never persist.
  return {
    url,
    ...(label !== undefined ? { label } : {}),
    ...(newTab !== undefined ? { newTab } : {}),
  };
}

// URL gate shared with richtext link marks (`SAFE_HREF_RE`): relative
// forms (`/pricing` — what the admin's entry picker stores — plus `#`,
// `?`, `./`) and `https?` / `mailto:` / `tel:` absolutes. Script-bearing
// schemes (`javascript:`, `data:`) hard-fail — the value is destined
// for rendered anchor hrefs.
function isValidLinkUrl(url: string): boolean {
  return SAFE_HREF_RE.test(url);
}

// Sanitizer flow-control sentinel — the write pipeline translates any
// sanitize throw into a `meta_invalid_value` CONFLICT envelope.
function invalidLink(): Error {
  return new Error("invalid_value");
}

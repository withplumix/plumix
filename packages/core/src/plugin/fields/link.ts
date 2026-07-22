import type { Label } from "../../i18n/label.js";
import type {
  FieldBuilder,
  LinkMetaBoxField,
  LinkValue,
  MetaBoxFieldSpan,
  MetaBoxFieldValidate,
} from "../manifest.js";
import { humanizeFieldKey } from "./builder.js";

export type { LinkValue } from "../manifest.js";

interface LinkFieldState {
  readonly label?: Label;
  readonly description?: Label;
  readonly placeholder?: Label;
  readonly prepend?: Label;
  readonly append?: Label;
  readonly default?: LinkValue;
  readonly required?: true;
  readonly span?: MetaBoxFieldSpan;
  readonly capability?: string;
  readonly showInApi?: true;
  readonly sanitize?: (value: unknown) => unknown;
  readonly validate?: MetaBoxFieldValidate;
}

/**
 * Fluent chain for the `link` field — see `StringFieldBuilder` for the
 * chassis conventions (immutability, phantom `V`, `build()` seam). `V`
 * is `LinkValue | undefined` unadorned, narrowed to `LinkValue` by
 * `.required()` / `.default()`.
 */
export class LinkFieldBuilder<
  V extends LinkValue | undefined = LinkValue | undefined,
> implements FieldBuilder<LinkMetaBoxField> {
  /** Phantom read type of the field — type-level only, never assigned. */
  declare readonly _value: V;

  readonly #key: string;
  readonly #state: LinkFieldState;

  constructor(key: string, state: LinkFieldState = {}) {
    this.#key = key;
    this.#state = state;
  }

  #fork<V2 extends LinkValue | undefined = V>(
    patch: Partial<LinkFieldState>,
  ): LinkFieldBuilder<V2> {
    return new LinkFieldBuilder<V2>(this.#key, { ...this.#state, ...patch });
  }

  /** Override the derived (humanized-key) label. */
  label(label: Label): LinkFieldBuilder<V> {
    return this.#fork({ label });
  }

  /** Help text rendered under the label. */
  description(description: Label): LinkFieldBuilder<V> {
    return this.#fork({ description });
  }

  /** Placeholder for the control's URL input. */
  placeholder(placeholder: Label): LinkFieldBuilder<V> {
    return this.#fork({ placeholder });
  }

  /** Static adornment rendered before the input. */
  prepend(prepend: Label): LinkFieldBuilder<V> {
    return this.#fork({ prepend });
  }

  /** Static adornment rendered after the input. */
  append(append: Label): LinkFieldBuilder<V> {
    return this.#fork({ append });
  }

  /** Admin-form prefill for unsaved keys — narrows the read type to `LinkValue`. */
  default(value: LinkValue): LinkFieldBuilder<LinkValue> {
    return this.#fork<LinkValue>({ default: value });
  }

  /** Mark the field required — narrows the read type to `LinkValue`. */
  required(): LinkFieldBuilder<LinkValue> {
    return this.#fork<LinkValue>({ required: true });
  }

  /**
   * Column span within the box's 12-column grid — a universal layout
   * hint; surfaces that can't honor it (the entry editor rail) ignore it.
   */
  span(span: MetaBoxFieldSpan): LinkFieldBuilder<V> {
    return this.#fork({ span });
  }

  /** Capability gate for this field — see `MetaBoxFieldBase.capability`. */
  capability(capability: string): LinkFieldBuilder<V> {
    return this.#fork({ capability });
  }

  /** Opt this field's value into public REST responses (default-deny). */
  showInApi(): LinkFieldBuilder<V> {
    return this.#fork({ showInApi: true });
  }

  /**
   * Normalising transform, applied after the built-in shape/URL
   * validation and before persistence.
   */
  sanitize(
    sanitize: (value: NonNullable<V>) => NonNullable<V>,
  ): LinkFieldBuilder<V> {
    return this.#fork({ sanitize: sanitize as (value: unknown) => unknown });
  }

  /**
   * Custom validation — `true` for valid, or an i18n-able failure
   * message (sync or async). Runs after `.sanitize()` and the
   * declarative constraints.
   */
  validate(
    validate: (value: NonNullable<V>) => true | Label | Promise<true | Label>,
  ): LinkFieldBuilder<V> {
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
      sanitize: buildLinkSanitize(sanitize),
    };
  }
}

/** CTA-style link field — internal entry URL or external URL, optional label + new-tab. */
export function link(key: string): LinkFieldBuilder {
  return new LinkFieldBuilder(key);
}

// The built-in shape/URL check always runs first so a chained
// `.sanitize()` callback can trust its typed `LinkValue` parameter.
function buildLinkSanitize(
  userSanitize: ((value: unknown) => unknown) | undefined,
): (value: unknown) => unknown {
  return (value) => {
    const coerced = coerceLinkValue(value);
    return userSanitize ? userSanitize(coerced) : coerced;
  };
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

// Accepted URL forms: a site-relative path (`/pricing` — what the
// admin's entry picker stores; `//host/x` protocol-relative also
// passes) or an absolute URL the WHATWG parser accepts
// (`https://…`, `mailto:…`, `tel:…`).
function isValidLinkUrl(url: string): boolean {
  if (url.startsWith("/")) return true;
  return URL.canParse(url);
}

// Sanitizer flow-control sentinel — the write pipeline translates any
// sanitize throw into a `meta_invalid_value` CONFLICT envelope.
function invalidLink(): Error {
  return new Error("invalid_value");
}

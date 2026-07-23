import type { Label } from "plumix/i18n";
import type {
  FieldBuilder,
  MediaListMetaBoxField,
  MediaMetaBoxField,
  MetaBoxFieldSpan,
  MetaBoxFieldValidate,
  MetaFieldCondition,
  MetaFieldConditionRule,
  ReferenceTarget,
} from "plumix/plugin";

import type { MediaFieldScope, MediaReference } from "./lookup.js";

// "heroImage" → "Hero image". Derived default for fields authored
// without `.label()`. Kept local — the plugin can't reach core's
// private `humanizeFieldKey`, and the rule is a one-liner.
function humanizeFieldKey(key: string): string {
  const spaced = key
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll(/[_:-]+/g, " ")
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** One read element: the hydrated `MediaReference`, or the bare id after `.returns("id")`. */
type MediaReadItem<Returns extends "id" | "hydrated"> = Returns extends "id"
  ? string
  : MediaReference;

/**
 * The phantom read type. A single reference is always optional (a
 * target can be deleted after the id is written); a multi reference
 * reads a dense array, present once `.required()` guarantees a write.
 */
type MediaReadValue<
  Multiple extends boolean,
  Required extends boolean,
  Returns extends "id" | "hydrated",
> = Multiple extends true
  ? Required extends true
    ? readonly MediaReadItem<Returns>[]
    : readonly MediaReadItem<Returns>[] | undefined
  : MediaReadItem<Returns> | undefined;

/** The phantom stored shape — bare ids; `.required()` narrows optionality. */
type MediaStoredValue<
  Multiple extends boolean,
  Required extends boolean,
> = Multiple extends true
  ? Required extends true
    ? readonly string[]
    : readonly string[] | undefined
  : Required extends true
    ? string
    : string | undefined;

interface MediaFieldState {
  readonly visibleWhen?: MetaFieldCondition;
  readonly label?: Label;
  readonly description?: Label;
  readonly default?: string | readonly string[];
  readonly required?: true;
  readonly multiple?: true;
  readonly returns?: "id";
  readonly max?: number;
  readonly span?: MetaBoxFieldSpan;
  readonly capability?: string;
  readonly showInApi?: true;
  readonly sanitize?: (value: unknown) => unknown;
  readonly validate?: MetaBoxFieldValidate;
}

/**
 * Fluent chain for the `media` reference field —
 * `media("hero").accept("image/")`. Mirrors the core reference
 * builders (`entry` / `term` / `user`): `.accept()` refines the picker
 * MIME filter, `.multiple()` flips to an id array, `.returns("id")`
 * opts out of read-time hydration. Immutable — every call returns a
 * fresh instance.
 *
 * Storage is the bare media id (an id array under `.multiple()`); reads
 * hydrate to the {@link MediaReference} summary by default so themes
 * render a media field (URL included) without a manual fetch.
 */
export class MediaFieldBuilder<
  K extends string = string,
  Multiple extends boolean = false,
  Required extends boolean = false,
  Returns extends "id" | "hydrated" = "hydrated",
> implements FieldBuilder {
  /** Phantom literal key of the field — type-level only, never assigned. */
  declare readonly _key: K;
  /** Phantom read type — hydrated `MediaReference` by default, id after `.returns("id")`. */
  declare readonly _value: MediaReadValue<Multiple, Required, Returns>;
  /** Phantom stored shape — bare ids; `.required()` narrows optionality. */
  declare readonly _stored: MediaStoredValue<Multiple, Required>;
  /** Phantom cardinality marker backing the compile-time gate on `.multiple()` / `.max()`. */
  declare readonly _multiple: Multiple;

  readonly #key: string;
  readonly #scope: MediaFieldScope;
  readonly #state: MediaFieldState;

  constructor(
    key: string,
    scope: MediaFieldScope = {},
    state: MediaFieldState = {},
  ) {
    this.#key = key;
    this.#scope = scope;
    this.#state = state;
  }

  #fork<
    Multiple2 extends boolean = Multiple,
    Required2 extends boolean = Required,
    Returns2 extends "id" | "hydrated" = Returns,
  >(
    patch: Partial<MediaFieldState>,
    scope: MediaFieldScope = this.#scope,
  ): MediaFieldBuilder<K, Multiple2, Required2, Returns2> {
    return new MediaFieldBuilder<K, Multiple2, Required2, Returns2>(
      this.#key,
      scope,
      { ...this.#state, ...patch },
    );
  }

  /**
   * Filter the picker (and re-validate on write) by MIME. A single
   * prefix string (`"image/"` matches every `image/*`) or a readonly
   * array of exact MIME matches (`["image/png", "application/pdf"]`).
   */
  accept(
    accept: string | readonly string[],
  ): MediaFieldBuilder<K, Multiple, Required, Returns> {
    return this.#fork({}, { accept });
  }

  /**
   * Store an array of ids instead of a single one — reads become a
   * dense array. Declare cardinality before `.required()` narrows the
   * shapes; the `this`-type gate blocks a post-narrowing `.multiple()`.
   */
  multiple(
    this: MediaFieldBuilder<K, false, false, Returns>,
  ): MediaFieldBuilder<K, true, false, Returns> {
    return this.#fork<true, false, Returns>({ multiple: true });
  }

  /** Cap the array length — multi-value fields only. */
  max(
    this: MediaFieldBuilder<K, true, Required, Returns>,
    max: number,
  ): MediaFieldBuilder<K, true, Required, Returns> {
    return this.#fork<true, Required, Returns>({ max });
  }

  /** Read the bare stored id(s) instead of the hydrated summary. */
  returns(shape: "id"): MediaFieldBuilder<K, Multiple, Required, "id"> {
    return this.#fork<Multiple, Required, "id">({ returns: shape });
  }

  /** Mark the field required — enforced at write time by the constraint walker. */
  required(): MediaFieldBuilder<K, Multiple, true, Returns> {
    return this.#fork<Multiple, true, Returns>({ required: true });
  }

  /** Override the derived (humanized-key) label. */
  label(label: Label): MediaFieldBuilder<K, Multiple, Required, Returns> {
    return this.#fork({ label });
  }

  /** Help text rendered under the label. */
  description(
    description: Label,
  ): MediaFieldBuilder<K, Multiple, Required, Returns> {
    return this.#fork({ description });
  }

  /** Prefill for absent keys — a stored id (or id array for multi fields). */
  default(
    value: Multiple extends true ? readonly string[] : string,
  ): MediaFieldBuilder<K, Multiple, Required, Returns> {
    return this.#fork({ default: value });
  }

  /** Column span within the box's 12-column grid — a universal layout hint. */
  span(
    span: MetaBoxFieldSpan,
  ): MediaFieldBuilder<K, Multiple, Required, Returns> {
    return this.#fork({ span });
  }

  /** Capability gate for this field — see `MetaBoxFieldBase.capability`. */
  capability(
    capability: string,
  ): MediaFieldBuilder<K, Multiple, Required, Returns> {
    return this.#fork({ capability });
  }

  /** Opt this field's value into public REST responses (default-deny). */
  showInApi(): MediaFieldBuilder<K, Multiple, Required, Returns> {
    return this.#fork({ showInApi: true });
  }

  /** Rule factory: this field's stored id equals `value`. */
  is(value: string): MetaFieldConditionRule {
    return { key: this.#key, op: "eq", value };
  }

  /** Rule factory: this field's stored id differs from `value`. */
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

  /** Rule factory: the selection includes `id` — multi-value only. */
  contains(
    this: MediaFieldBuilder<K, true, Required, Returns>,
    id: string,
  ): MetaFieldConditionRule {
    return { key: this.#key, op: "contains", value: id };
  }

  /** Rule factory: the selection does not include `id` — multi-value only. */
  notContains(
    this: MediaFieldBuilder<K, true, Required, Returns>,
    id: string,
  ): MetaFieldConditionRule {
    return { key: this.#key, op: "not_contains", value: id };
  }

  /**
   * Show this field only when every rule passes (one AND group).
   * Replaces any previously declared condition; `.orVisibleWhen()`
   * adds alternatives.
   */
  visibleWhen(
    ...rules: MetaFieldConditionRule[]
  ): MediaFieldBuilder<K, Multiple, Required, Returns> {
    return this.#fork({ visibleWhen: [rules] });
  }

  /** Add an OR alternative — one more AND group of rules. */
  orVisibleWhen(
    ...rules: MetaFieldConditionRule[]
  ): MediaFieldBuilder<K, Multiple, Required, Returns> {
    return this.#fork({
      visibleWhen: [...(this.#state.visibleWhen ?? []), rules],
    });
  }

  /** Normalising transform, applied after coercion and before persistence. */
  sanitize(
    sanitize: (value: unknown) => unknown,
  ): MediaFieldBuilder<K, Multiple, Required, Returns> {
    return this.#fork({ sanitize });
  }

  /** Custom validation — `true` for valid, or an i18n-able failure message. */
  validate(
    validate: MetaBoxFieldValidate,
  ): MediaFieldBuilder<K, Multiple, Required, Returns> {
    return this.#fork({ validate });
  }

  /** Compile the chain into the wire/manifest field definition. */
  build(): Multiple extends true ? MediaListMetaBoxField : MediaMetaBoxField {
    const { multiple, ...state } = this.#state;
    const target: ReferenceTarget = multiple
      ? { kind: "media", scope: this.#scope, multiple: true }
      : { kind: "media", scope: this.#scope };
    const field = {
      ...state,
      key: this.#key,
      label: state.label ?? humanizeFieldKey(this.#key),
      type: "json",
      inputType: multiple ? "mediaList" : "media",
      referenceTarget: target,
    };
    return field as Multiple extends true
      ? MediaListMetaBoxField
      : MediaMetaBoxField;
  }
}

/**
 * Build a typed `media` reference field — `media("hero")`. The picker
 * opens the Media Library in modal mode; `.accept()` filters the grid
 * (and re-validates on write), `.multiple()` stores an id array.
 */
export function media<K extends string>(key: K): MediaFieldBuilder<K> {
  return new MediaFieldBuilder(key);
}

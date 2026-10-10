import type { Capability } from "../../access/contract/capability.js";
import type { Label } from "../../i18n/label.js";
import type { JsonValue } from "../../json.js";
import type { MetaFieldConditionRule } from "./condition.js";
import type { InferFields, InferStoredFields } from "./contributions.js";
import type {
  FieldBuilder,
  GroupMetaBoxField,
  MetaBoxField,
  MetaBoxFieldInput,
  MetaBoxFieldSpan,
  MetaBoxFieldValidate,
} from "./meta-box-field.js";
import type { UniversalFieldState } from "./universal.js";
import { humanizeFieldKey } from "./builder.js";
import { compileMetaBoxFields } from "./meta-box-field.js";
import { assertSubFields } from "./sub-fields.js";

interface GroupFieldState extends UniversalFieldState {
  readonly fields: readonly MetaBoxField[];
  readonly default?: unknown;
}

/**
 * Entry point of the `group()` chain — only `.fields()` is available
 * until the members are declared, so a group without members can't
 * reach `build()` (registration surfaces require a `build` method).
 */
export class GroupFieldSeed<K extends string = string> {
  readonly #key: K;

  constructor(key: K) {
    this.#key = key;
  }

  /** Validated eagerly: key shape, uniqueness, prototype-pollution guard. */
  fields<const F extends readonly MetaBoxFieldInput[]>(
    fields: F,
  ): GroupFieldBuilder<F, K> {
    const compiled = compileMetaBoxFields(fields);
    assertSubFields("group", this.#key, compiled);
    return new GroupFieldBuilder<F, K>(this.#key, { fields: compiled });
  }
}

/**
 * Stores members as a nested object under the group's own key, never
 * flattened. Immutable: every call returns a fresh instance.
 */
export class GroupFieldBuilder<
  F extends readonly MetaBoxFieldInput[],
  K extends string = string,
  V = InferFields<F> | undefined,
  S = InferStoredFields<F> | undefined,
> implements FieldBuilder<GroupMetaBoxField> {
  /** Phantom literal key of the field — type-level only, never assigned. */
  declare readonly _key: K;
  /** Phantom read type of the field — type-level only, never assigned. */
  declare readonly _value: V;
  /** Phantom stored shape of the field — type-level only, never assigned. */
  declare readonly _stored: S;

  readonly #key: string;
  readonly #state: GroupFieldState;

  constructor(key: string, state: GroupFieldState) {
    this.#key = key;
    this.#state = state;
  }

  #fork<V2 = V, S2 = S>(
    patch: Partial<GroupFieldState>,
  ): GroupFieldBuilder<F, K, V2, S2> {
    return new GroupFieldBuilder<F, K, V2, S2>(this.#key, {
      ...this.#state,
      ...patch,
    });
  }

  /** Override the derived (humanized-key) label. */
  label(label: Label): GroupFieldBuilder<F, K, V, S> {
    return this.#fork({ label });
  }

  /** Help text rendered under the label. */
  description(description: Label): GroupFieldBuilder<F, K, V, S> {
    return this.#fork({ description });
  }

  /**
   * The value a new entity starts with, in the STORED spelling (ISO string,
   * bare id) because it is stored unconverted. Without one, members' defaults
   * apply.
   */
  default(value: Partial<InferStoredFields<F>>): GroupFieldBuilder<F, K, V, S> {
    return this.#fork({ default: value });
  }

  /** Mark the group required — narrows the read/stored types to the
   *  non-optional nested record. */
  required(): GroupFieldBuilder<F, K, InferFields<F>, InferStoredFields<F>> {
    return this.#fork<InferFields<F>, InferStoredFields<F>>({ required: true });
  }

  /**
   * Column span within the box's 12-column grid — a universal layout
   * hint; surfaces that can't honor it (the entry editor rail) ignore it.
   */
  span(span: MetaBoxFieldSpan): GroupFieldBuilder<F, K, V, S> {
    return this.#fork({ span });
  }

  /** Capability gate for this field — see `MetaBoxFieldBase.capability`. */
  capability(capability: Capability): GroupFieldBuilder<F, K, V, S> {
    return this.#fork({ capability });
  }

  /** Opt this field's value into public REST responses (default-deny). */
  showInApi(): GroupFieldBuilder<F, K, V, S> {
    return this.#fork({ showInApi: true });
  }

  /** Rule factory: this group has no stored value. */
  isEmpty(): MetaFieldConditionRule {
    return { key: this.#key, op: "empty" };
  }

  /** Rule factory: this group has a stored value. */
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
  ): GroupFieldBuilder<F, K, V, S> {
    return this.#fork({ visibleWhen: [rules] });
  }

  /** Add an OR alternative — one more AND group of rules. */
  orVisibleWhen(
    ...rules: MetaFieldConditionRule[]
  ): GroupFieldBuilder<F, K, V, S> {
    return this.#fork({
      visibleWhen: [...(this.#state.visibleWhen ?? []), rules],
    });
  }

  /**
   * Runs after every member settled, so it sees the stored shape (references
   * are bare ids). Blank-member and security checks re-run on the output;
   * returning no members clears the field.
   */
  sanitize(
    sanitize: (members: NonNullable<S>) => Partial<InferStoredFields<F>>,
  ): GroupFieldBuilder<F, K, V, S> {
    return this.#fork({ sanitize: sanitize as (value: unknown) => JsonValue });
  }

  /**
   * Reported against the group. Runs last, after the members and `.sanitize()`;
   * skipped when a member failed, the group is empty, or on a draft save.
   */
  validate(
    validate: (members: NonNullable<S>) => true | Label | Promise<true | Label>,
  ): GroupFieldBuilder<F, K, V, S> {
    return this.#fork({ validate: validate as MetaBoxFieldValidate });
  }

  /** Compile the chain into the wire/manifest field definition. */
  build(): GroupMetaBoxField {
    const { fields, ...state } = this.#state;
    return {
      ...state,
      key: this.#key,
      label: state.label ?? humanizeFieldKey(this.#key),
      type: "json",
      inputType: "group",
      fields,
    };
  }
}

/**
 * Named group of fields stored as a nested object under the group's own
 * key — `group("seo").fields([text("title"), textarea("description")])`
 * reads as `meta.seo.title` / `meta.seo.description`. Only `.fields()`
 * is available on the bare constructor.
 */
export function group<K extends string>(key: K): GroupFieldSeed<K> {
  return new GroupFieldSeed(key);
}

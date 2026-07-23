import type { Label } from "../../i18n/label.js";
import type {
  FieldBuilder,
  MetaBoxField,
  MetaBoxFieldInput,
  MetaBoxFieldSpan,
  RepeaterLayout,
  RepeaterMetaBoxField,
} from "../manifest.js";
import type {
  MetaFieldCondition,
  MetaFieldConditionRule,
} from "./condition.js";
import type { InferFields, InferStoredFields } from "./contributions.js";
import { compileMetaBoxFields } from "../manifest.js";
import { humanizeFieldKey } from "./builder.js";
import { assertSubFields } from "./sub-fields.js";

interface RepeaterFieldState {
  readonly subFields: readonly MetaBoxField[];
  readonly visibleWhen?: MetaFieldCondition;
  readonly label?: Label;
  readonly description?: Label;
  readonly required?: true;
  readonly span?: MetaBoxFieldSpan;
  readonly capability?: string;
  readonly showInApi?: true;
  readonly min?: number;
  readonly max?: number;
  readonly addLabel?: Label;
  readonly layout?: RepeaterLayout;
  readonly collapsed?: string;
}

/**
 * Entry point of the `repeater()` chain — only `.fields()` is available
 * until the row schema is declared, so a repeater without sub-fields
 * can't reach `build()` (registration surfaces require a `build`
 * method), and `.collapsed()` can be typed against the declared keys.
 */
export class RepeaterFieldSeed<K extends string = string> {
  readonly #key: K;

  constructor(key: K) {
    this.#key = key;
  }

  /**
   * Declare the row schema — infers the typed row shape. Sub-fields may
   * be any registered field type, including nested repeaters and
   * groups; types recurse. Validated eagerly (key shape, uniqueness,
   * prototype-pollution guard).
   */
  fields<const F extends readonly MetaBoxFieldInput[]>(
    fields: F,
  ): RepeaterFieldBuilder<F, K> {
    const subFields = compileMetaBoxFields(fields);
    assertSubFields("repeater", this.#key, subFields);
    return new RepeaterFieldBuilder<F, K>(this.#key, { subFields });
  }
}

/**
 * Fluent chain for repeater fields. Immutable — every call returns a
 * fresh instance, so a shared base chain can be forked without
 * aliasing.
 *
 * `F` is the declared row-schema tuple (drives the recursive row type
 * and `.collapsed()` key typing); `K` is the literal field key; `V` is
 * the phantom read type — `readonly InferFields<F>[] | undefined`,
 * narrowed to the non-optional array by `.required()`; `S` is the
 * phantom stored shape (`InferStoredFields<F>` rows). All purely
 * type-level — nothing at runtime carries them.
 */
export class RepeaterFieldBuilder<
  F extends readonly MetaBoxFieldInput[],
  K extends string = string,
  V = readonly InferFields<F>[] | undefined,
  S = readonly InferStoredFields<F>[] | undefined,
> implements FieldBuilder<RepeaterMetaBoxField> {
  /** Phantom literal key of the field — type-level only, never assigned. */
  declare readonly _key: K;
  /** Phantom read type of the field — type-level only, never assigned. */
  declare readonly _value: V;
  /** Phantom stored shape of the field — type-level only, never assigned. */
  declare readonly _stored: S;

  readonly #key: string;
  readonly #state: RepeaterFieldState;

  constructor(key: string, state: RepeaterFieldState) {
    this.#key = key;
    this.#state = state;
  }

  #fork<V2 = V, S2 = S>(
    patch: Partial<RepeaterFieldState>,
  ): RepeaterFieldBuilder<F, K, V2, S2> {
    return new RepeaterFieldBuilder<F, K, V2, S2>(this.#key, {
      ...this.#state,
      ...patch,
    });
  }

  /** Override the derived (humanized-key) label. */
  label(label: Label): RepeaterFieldBuilder<F, K, V, S> {
    return this.#fork({ label });
  }

  /** Help text rendered under the label. */
  description(description: Label): RepeaterFieldBuilder<F, K, V, S> {
    return this.#fork({ description });
  }

  /** Minimum row count — enforced server-side by the constraint walker. */
  min(min: number): RepeaterFieldBuilder<F, K, V, S> {
    return this.#fork({ min });
  }

  /** Maximum row count — enforced server-side and by the admin add button. */
  max(max: number): RepeaterFieldBuilder<F, K, V, S> {
    return this.#fork({ max });
  }

  /** Custom label for the admin add-row button. */
  addLabel(addLabel: Label): RepeaterFieldBuilder<F, K, V, S> {
    return this.#fork({ addLabel });
  }

  /** Admin row layout — see {@link RepeaterLayout}. */
  layout(layout: RepeaterLayout): RepeaterFieldBuilder<F, K, V, S> {
    return this.#fork({ layout });
  }

  /**
   * Make rows collapsible in the admin, labelling each collapsed row by
   * the chosen sub-field's stored value. The key is typed against the
   * declared row schema, so a nonexistent sub-field is a compile error.
   */
  collapsed(
    subFieldKey: keyof InferFields<F> & string,
  ): RepeaterFieldBuilder<F, K, V, S> {
    return this.#fork({ collapsed: subFieldKey });
  }

  /** Mark the field required — narrows the read/stored types to the
   *  non-optional array (rejects zero rows server-side). */
  required(): RepeaterFieldBuilder<
    F,
    K,
    readonly InferFields<F>[],
    readonly InferStoredFields<F>[]
  > {
    return this.#fork<
      readonly InferFields<F>[],
      readonly InferStoredFields<F>[]
    >({ required: true });
  }

  /**
   * Column span within the box's 12-column grid — a universal layout
   * hint; surfaces that can't honor it (the entry editor rail) ignore it.
   */
  span(span: MetaBoxFieldSpan): RepeaterFieldBuilder<F, K, V, S> {
    return this.#fork({ span });
  }

  /** Capability gate for this field — see `MetaBoxFieldBase.capability`. */
  capability(capability: string): RepeaterFieldBuilder<F, K, V, S> {
    return this.#fork({ capability });
  }

  /** Opt this field's value into public REST responses (default-deny). */
  showInApi(): RepeaterFieldBuilder<F, K, V, S> {
    return this.#fork({ showInApi: true });
  }

  /** Rule factory: this repeater has no rows (unset or cleared). */
  isEmpty(): MetaFieldConditionRule {
    return { key: this.#key, op: "empty" };
  }

  /** Rule factory: this repeater has at least one row. */
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
  ): RepeaterFieldBuilder<F, K, V, S> {
    return this.#fork({ visibleWhen: [rules] });
  }

  /** Add an OR alternative — one more AND group of rules. */
  orVisibleWhen(
    ...rules: MetaFieldConditionRule[]
  ): RepeaterFieldBuilder<F, K, V, S> {
    return this.#fork({
      visibleWhen: [...(this.#state.visibleWhen ?? []), rules],
    });
  }

  /** Compile the chain into the wire/manifest field definition. */
  build(): RepeaterMetaBoxField {
    const { subFields, ...state } = this.#state;
    return {
      ...state,
      key: this.#key,
      label: state.label ?? humanizeFieldKey(this.#key),
      type: "json",
      inputType: "repeater",
      subFields,
    };
  }
}

/**
 * Repeatable list of structured rows —
 * `repeater("links").fields([text("label"), url("href")])`. Only
 * `.fields()` is available on the bare constructor; the returned
 * builder carries row-count bounds (`.min()`/`.max()`), UX affordances
 * (`.addLabel()`, `.layout()`, `.collapsed()`), and the universal chain.
 */
export function repeater<K extends string>(key: K): RepeaterFieldSeed<K> {
  return new RepeaterFieldSeed(key);
}

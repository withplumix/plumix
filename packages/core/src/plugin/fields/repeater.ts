import type { Label } from "../../i18n/label.js";
import type { JsonValue } from "../../json.js";
import type { MetaFieldConditionRule } from "./condition.js";
import type { InferFields, InferStoredFields } from "./contributions.js";
import type {
  FieldBuilder,
  MetaBoxField,
  MetaBoxFieldInput,
  MetaBoxFieldSpan,
  MetaBoxFieldValidate,
  RepeaterDialogSize,
  RepeaterLayout,
  RepeaterMetaBoxField,
} from "./meta-box-field.js";
import type { UniversalFieldState } from "./universal.js";
import { humanizeFieldKey } from "./builder.js";
import { compileMetaBoxFields } from "./meta-box-field.js";
import { assertSubFields } from "./sub-fields.js";

interface RepeaterFieldState extends UniversalFieldState {
  readonly subFields: readonly MetaBoxField[];
  readonly default?: unknown;
  readonly min?: number;
  readonly max?: number;
  readonly addLabel?: Label;
  readonly layout?: RepeaterLayout;
  readonly collapsed?: string;
  readonly dialogSize?: RepeaterDialogSize;
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

  /**
   * Rows the admin form seeds when the key has no stored value. Typed
   * against the declared row schema in its STORED spelling — an ISO
   * string, a bare reference id — because the seed lands in the form bag
   * with no conversion. Rows are partial by design; a misspelled
   * sub-field key is a compile error.
   *
   * Applies on read only, and a seeded row is not a stored one, so this
   * does not narrow the read type the way `.required()` does. It also
   * reseeds after the repeater is cleared: an emptied repeater deletes
   * its key, and a key with no stored value is exactly what a default
   * answers.
   */
  default(
    rows: readonly Partial<InferStoredFields<F>>[],
  ): RepeaterFieldBuilder<F, K, V, S> {
    return this.#fork({ default: rows });
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
   * Width of the row-editor dialog — see {@link RepeaterDialogSize}.
   * Widen it for dense, multi-column rows; default `md`.
   */
  dialogSize(dialogSize: RepeaterDialogSize): RepeaterFieldBuilder<F, K, V, S> {
    return this.#fork({ dialogSize });
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

  /** Rule factory: more than `count` rows. */
  countGt(count: number): MetaFieldConditionRule {
    return { key: this.#key, op: "count_gt", value: count };
  }

  /** Rule factory: fewer than `count` rows. */
  countLt(count: number): MetaFieldConditionRule {
    return { key: this.#key, op: "count_lt", value: count };
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

  /**
   * Reshape the whole row list before persistence — reorder, de-dupe or
   * trim. Runs once, after every cell has been settled, which is why it is
   * typed against the stored shape: a reference cell is a bare id here,
   * not the hydrated summary a read returns. Cells are not re-validated
   * afterwards, but the blank-row strip and the security gates do re-run
   * over the output, so a sanitizer cannot write a value into a cell that
   * the cell's own field would have refused. The row-count bounds are
   * checked against what the callback returned, so a sanitizer may trim
   * to `.max()` or pad to `.min()` — and a de-dupe that cuts below
   * `.min()` is still rejected. Returning no rows clears the field.
   */
  sanitize(
    sanitize: (
      rows: NonNullable<S>,
    ) => readonly Partial<InferStoredFields<F>>[],
  ): RepeaterFieldBuilder<F, K, V, S> {
    return this.#fork({ sanitize: sanitize as (value: unknown) => JsonValue });
  }

  /**
   * Cross-row rule — returns `true` or the failure message (sync or
   * async), reported against the repeater itself. Runs last: after the
   * blank-row strip, after every cell passed, and after `.sanitize()`, so
   * a uniqueness or total-count rule reasons about exactly the rows that
   * will be stored. Skipped when any cell failed, when the strip leaves no
   * rows (that is a deletion), and on a draft save.
   */
  validate(
    validate: (rows: NonNullable<S>) => true | Label | Promise<true | Label>,
  ): RepeaterFieldBuilder<F, K, V, S> {
    return this.#fork({ validate: validate as MetaBoxFieldValidate });
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

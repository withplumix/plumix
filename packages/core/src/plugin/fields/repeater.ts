import type { Capability } from "../../access/contract/capability.js";
import type { Label } from "../../i18n/label.js";
import type { JsonObject, JsonValue } from "../../json.js";
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
import { startingMeta } from "./starting-meta.js";
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
 * Only `.fields()` is available until the row schema is declared, so a repeater
 * can't build without sub-fields and `.collapsed()` is typed against their
 * keys.
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
 * Immutable: every call returns a fresh instance, so a shared base chain can be
 * forked.
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
   * The rows a new entity starts with, in the STORED spelling (ISO string, bare
   * id) because they are stored unconverted. Each partial row is completed with
   * the subfield defaults.
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

  /** Labels each collapsed row by the chosen sub-field's stored value. */
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
  capability(capability: Capability): RepeaterFieldBuilder<F, K, V, S> {
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
   * Runs after every cell settled, so it sees the stored shape. The blank-row
   * strip, security gates and row-count bounds re-run on the output; returning
   * no rows clears the field.
   */
  sanitize(
    sanitize: (
      rows: NonNullable<S>,
    ) => readonly Partial<InferStoredFields<F>>[],
  ): RepeaterFieldBuilder<F, K, V, S> {
    return this.#fork({ sanitize: sanitize as (value: unknown) => JsonValue });
  }

  /**
   * Reported against the repeater. Runs last, after the blank-row strip, the
   * cells and `.sanitize()`; skipped when a cell failed, no rows remain, or on
   * a draft save.
   */
  validate(
    validate: (rows: NonNullable<S>) => true | Label | Promise<true | Label>,
  ): RepeaterFieldBuilder<F, K, V, S> {
    return this.#fork({ validate: validate as MetaBoxFieldValidate });
  }

  /**
   * Compile the chain into the wire/manifest field definition. Each default
   * row is completed here with the subfield defaults, so it starts the way a
   * row added in the admin does.
   */
  build(): RepeaterMetaBoxField {
    const { subFields, default: rows, ...state } = this.#state;
    const blank = startingMeta(subFields);
    return {
      ...state,
      ...(Array.isArray(rows) && {
        default: rows.map((row: JsonObject) => ({ ...blank, ...row })),
      }),
      key: this.#key,
      label: state.label ?? humanizeFieldKey(this.#key),
      type: "json",
      inputType: "repeater",
      subFields,
    };
  }
}

/** Only `.fields()` is available on the bare constructor. */
export function repeater<K extends string>(key: K): RepeaterFieldSeed<K> {
  return new RepeaterFieldSeed(key);
}

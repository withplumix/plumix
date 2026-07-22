import type { Label } from "../../i18n/label.js";
import type {
  FieldBuilder,
  MetaBoxFieldOption,
  MetaBoxFieldSpan,
  MetaBoxFieldValidate,
  MultiSelectMetaBoxField,
  SelectAppearance,
  SelectMetaBoxField,
  SingleSelectMetaBoxField,
} from "../manifest.js";
import { humanizeFieldKey } from "./builder.js";

/**
 * An option passed to `.options()` — either the full `{ value, label }`
 * shape or a string shorthand whose label derives from the humanized
 * value (`"videoHero"` → "Video hero").
 */
export type SelectOptionInput = string | MetaBoxFieldOption;

/** Literal value union inferred from an `.options()` array. */
type OptionValue<T extends SelectOptionInput> = T extends string
  ? T
  : T extends MetaBoxFieldOption
    ? T["value"]
    : never;

/** Appearances legal for the given cardinality — radio and the dropdown
 *  are single-only, checkboxes multi-only, buttons works on both. */
type AppearanceFor<Multiple extends boolean> = Multiple extends true
  ? "buttons" | "checkboxes"
  : "select" | "radio" | "buttons";

interface SelectFieldState {
  readonly options: readonly MetaBoxFieldOption[];
  readonly multiple?: true;
  readonly max?: number;
  readonly appearance?: SelectAppearance;
  readonly label?: Label;
  readonly description?: Label;
  readonly default?: string | readonly string[];
  readonly required?: true;
  readonly span?: MetaBoxFieldSpan;
  readonly capability?: string;
  readonly showInApi?: true;
  readonly sanitize?: (value: unknown) => unknown;
  readonly validate?: MetaBoxFieldValidate;
}

/**
 * Entry point of the `select()` chain — only `.options()` is available
 * until the option list is declared, so a choice field without choices
 * can't reach `build()` (registration surfaces require a `build`
 * method).
 */
export class SelectFieldSeed<K extends string = string> {
  readonly #key: K;

  constructor(key: K) {
    this.#key = key;
  }

  /** Declare the option list — infers the value literal union. */
  options<const Options extends readonly SelectOptionInput[]>(
    options: Options,
  ): SelectFieldBuilder<OptionValue<Options[number]>, K> {
    return new SelectFieldBuilder(this.#key, {
      options: options.map((opt) =>
        typeof opt === "string"
          ? { value: opt, label: humanizeFieldKey(opt) }
          : opt,
      ),
    });
  }
}

/**
 * Fluent chain for choice fields. Immutable — every call returns a
 * fresh instance, so a shared base chain can be forked without
 * aliasing.
 *
 * Type parameters are the declaration's compile-time state: `O` is the
 * option literal union inferred by `.options()`; `Multiple` is the
 * cardinality (`.multiple()` flips it and the stored shape); `A` is
 * the chosen appearance, tracked so cardinality-illegal combinations
 * (radio + multiple) fail to compile in either call order; `V` is the
 * phantom read type — `O | undefined` unadorned, an array after
 * `.multiple()`, narrowed by `.required()` / `.default()`. All purely
 * type-level — nothing at runtime carries them.
 */
export class SelectFieldBuilder<
  O extends string,
  K extends string = string,
  Multiple extends boolean = false,
  A extends SelectAppearance | undefined = undefined,
  V = O | undefined,
  S = O | undefined,
> implements FieldBuilder<SelectMetaBoxField> {
  /** Phantom literal key of the field — type-level only, never assigned. */
  declare readonly _key: K;
  /** Phantom read type of the field — type-level only, never assigned. */
  declare readonly _value: V;
  /** Phantom stored shape — `.required()` narrows it (write-enforced);
   *  `.default()` does not (defaults apply at decode time). */
  declare readonly _stored: S;
  /** Phantom cardinality/appearance markers backing the compile-time
   *  gating of `.multiple()`, `.max()`, and `.appearance()`. */
  declare readonly _multiple: Multiple;
  declare readonly _appearance: A;

  readonly #key: string;
  readonly #state: SelectFieldState;

  constructor(key: string, state: SelectFieldState) {
    this.#key = key;
    this.#state = state;
  }

  #fork<
    Multiple2 extends boolean = Multiple,
    A2 extends SelectAppearance | undefined = A,
    V2 = V,
    S2 = S,
  >(
    patch: Partial<SelectFieldState>,
  ): SelectFieldBuilder<O, K, Multiple2, A2, V2, S2> {
    return new SelectFieldBuilder<O, K, Multiple2, A2, V2, S2>(this.#key, {
      ...this.#state,
      ...patch,
    });
  }

  /**
   * Store an array of selected option values instead of a single one
   * (`type` flips to `json`). A type-level gate keeps it legal:
   * declare cardinality right after `.options()` — before `.default()`
   * / `.required()` narrow the value — and never after a single-only
   * `.appearance()` (`"select"` / `"radio"`).
   */
  multiple(
    // `undefined extends V` proves no narrowing call ran yet — the
    // stored default/read shapes are still scalar, so flipping to an
    // array is safe. `_value` is covariant, so a plain `O | undefined`
    // this-type alone wouldn't reject a narrowed receiver.
    this: undefined extends V
      ? SelectFieldBuilder<O, K, false, "buttons" | undefined, V, S>
      : never,
  ): SelectFieldBuilder<
    O,
    K,
    true,
    A,
    readonly O[] | undefined,
    readonly O[] | undefined
  > {
    // The conditional this-type erases the class shape inside the body;
    // restore it to reach the private #fork.
    const self = this as unknown as SelectFieldBuilder<O, K, false, A, V, S>;
    return self.#fork<
      true,
      A,
      readonly O[] | undefined,
      readonly O[] | undefined
    >({ multiple: true });
  }

  /**
   * Cap the selection count — multi-value fields only. Carried on the
   * definition and the wire today; server-side enforcement lands with
   * the generic constraint walker.
   */
  max(
    this: SelectFieldBuilder<O, K, true, A, V, S>,
    max: number,
  ): SelectFieldBuilder<O, K, true, A, V, S> {
    return this.#fork<true, A, V, S>({ max });
  }

  /**
   * Pick the admin control rendering the option list — the pure-UI
   * axis; the value shape never changes. Single-value fields accept
   * `"select"` (dropdown, the default), `"radio"`, and `"buttons"`;
   * multi-value fields accept `"buttons"` (the default) and
   * `"checkboxes"`.
   */
  appearance<A2 extends AppearanceFor<Multiple>>(
    appearance: A2,
  ): SelectFieldBuilder<O, K, Multiple, A2, V, S> {
    return this.#fork<Multiple, A2, V, S>({ appearance });
  }

  /** Override the derived (humanized-key) label. */
  label(label: Label): SelectFieldBuilder<O, K, Multiple, A, V, S> {
    return this.#fork({ label });
  }

  /** Help text rendered under the label. */
  description(description: Label): SelectFieldBuilder<O, K, Multiple, A, V, S> {
    return this.#fork({ description });
  }

  /** Admin-form prefill for unsaved keys — narrows away `undefined`. */
  default(
    value: Multiple extends true ? readonly O[] : O,
  ): SelectFieldBuilder<O, K, Multiple, A, NonNullable<V>, S> {
    return this.#fork<Multiple, A, NonNullable<V>, S>({ default: value });
  }

  /** Mark the field required — narrows away `undefined`. */
  required(): SelectFieldBuilder<
    O,
    K,
    Multiple,
    A,
    NonNullable<V>,
    NonNullable<S>
  > {
    return this.#fork<Multiple, A, NonNullable<V>, NonNullable<S>>({
      required: true,
    });
  }

  /**
   * Column span within the box's 12-column grid — a universal layout
   * hint; surfaces that can't honor it (the entry editor rail) ignore it.
   */
  span(span: MetaBoxFieldSpan): SelectFieldBuilder<O, K, Multiple, A, V, S> {
    return this.#fork({ span });
  }

  /** Capability gate for this field — see `MetaBoxFieldBase.capability`. */
  capability(capability: string): SelectFieldBuilder<O, K, Multiple, A, V, S> {
    return this.#fork({ capability });
  }

  /** Opt this field's value into public REST responses (default-deny). */
  showInApi(): SelectFieldBuilder<O, K, Multiple, A, V, S> {
    return this.#fork({ showInApi: true });
  }

  /** Normalising transform, applied after coercion and before persistence. */
  sanitize(
    sanitize: (value: NonNullable<V>) => NonNullable<V>,
  ): SelectFieldBuilder<O, K, Multiple, A, V, S> {
    return this.#fork({ sanitize: sanitize as (value: unknown) => unknown });
  }

  /**
   * Custom validation — `true` for valid, or an i18n-able failure
   * message (sync or async). Runs after `.sanitize()` and the
   * declarative constraints.
   */
  validate(
    validate: (value: NonNullable<V>) => true | Label | Promise<true | Label>,
  ): SelectFieldBuilder<O, K, Multiple, A, V, S> {
    return this.#fork({ validate: validate as MetaBoxFieldValidate });
  }

  /** Compile the chain into the wire/manifest field definition —
   *  the `multiple`/`type`-correlated variant matching the chain's
   *  cardinality. */
  build(): Multiple extends true
    ? MultiSelectMetaBoxField
    : SingleSelectMetaBoxField {
    const { multiple, ...state } = this.#state;
    // Multi-value fields keep multiselect's default option-membership
    // sanitizer (reject out-of-list values, de-dupe) unless the chain
    // supplied its own transform.
    const sanitize =
      state.sanitize ??
      (multiple ? buildOptionSanitizer(state.options) : undefined);
    const common = {
      ...state,
      ...(sanitize ? { sanitize } : {}),
      key: this.#key,
      label: state.label ?? humanizeFieldKey(this.#key),
      inputType: "select",
    } as const;
    // Branch so each arm satisfies its correlated `multiple`/`type`
    // variant; the cast collapses the runtime union onto the
    // `Multiple`-conditional return, which TS can't correlate itself.
    const field: SelectMetaBoxField = multiple
      ? { ...common, type: "json", multiple: true }
      : { ...common, type: "string" };
    return field as Multiple extends true
      ? MultiSelectMetaBoxField
      : SingleSelectMetaBoxField;
  }
}

function buildOptionSanitizer(
  optionList: readonly MetaBoxFieldOption[],
): (value: unknown) => readonly string[] {
  const allowed = new Set(optionList.map((opt) => opt.value));
  return (value) => {
    // eslint-disable-next-line no-restricted-syntax -- sanitizer flow-control sentinel; migrated in the field-sanitizer-error slice
    if (!Array.isArray(value)) throw new Error("invalid_value");
    const seen = new Set<string>();
    for (const item of value) {
      if (typeof item !== "string" || !allowed.has(item)) {
        // eslint-disable-next-line no-restricted-syntax -- sanitizer flow-control sentinel; migrated in the field-sanitizer-error slice
        throw new Error("invalid_value");
      }
      seen.add(item);
    }
    return [...seen];
  };
}

/**
 * Choice field over a fixed option list —
 * `select("size").options(["s", "m", "l"])`. Single-value by default;
 * `.multiple()` stores an array, `.appearance()` picks the admin
 * control. The option list is required: only `.options()` is available
 * on the bare constructor.
 */
export function select<K extends string>(key: K): SelectFieldSeed<K> {
  return new SelectFieldSeed(key);
}

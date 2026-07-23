import type { EntryStatus } from "../../db/schema/entries.js";
import type { UserRole } from "../../db/schema/users.js";
import type { Label } from "../../i18n/label.js";
import type { ReferenceHydrationShapes } from "../lookup.js";
import type {
  EntryListMetaBoxField,
  EntryReferenceMetaBoxField,
  FieldBuilder,
  MetaBoxFieldSpan,
  MetaBoxFieldValidate,
  ReferenceReadProjection,
  ReferenceTarget,
  TermListMetaBoxField,
  TermReferenceMetaBoxField,
  UserListMetaBoxField,
  UserMetaBoxField,
} from "../manifest.js";
import type {
  MetaFieldCondition,
  MetaFieldConditionRule,
} from "./condition.js";
import { humanizeFieldKey } from "./builder.js";

/**
 * The hydrated read shape for a reference `kind`, sourced from the
 * shared {@link ReferenceHydrationShapes} registry so the builder's
 * default read type tracks whatever the adapter actually resolves.
 * Plugin-registered kinds augment that registry; an unregistered kind
 * folds to `never`.
 */
type ReferenceSummaryOf<Kind extends string> =
  Kind extends keyof ReferenceHydrationShapes
    ? ReferenceHydrationShapes[Kind]
    : never;

/** One read element: the hydrated summary by default, the bare id after `.returns("id")`. */
type ReferenceReadItem<
  Summary,
  Returns extends "id" | "hydrated",
> = Returns extends "id" ? string : Summary;

/**
 * The phantom read type. Single references are *always* optional — a
 * live target can be deleted after the id is written, so even a
 * `.required()` field reads `undefined` for an orphan. Multi references
 * read a dense array (orphans drop out); the array itself is present
 * once `.required()` guarantees a write, optional otherwise.
 */
type ReferenceReadValue<
  Summary,
  Multiple extends boolean,
  Required extends boolean,
  Returns extends "id" | "hydrated",
> = Multiple extends true
  ? Required extends true
    ? readonly ReferenceReadItem<Summary, Returns>[]
    : readonly ReferenceReadItem<Summary, Returns>[] | undefined
  : ReferenceReadItem<Summary, Returns> | undefined;

/**
 * The phantom stored shape — bare ids, what `whereMeta` addresses.
 * `.required()` narrows away `undefined` (write-enforced); the read
 * projection (`.returns()`) never touches it.
 */
type ReferenceStoredValue<
  Multiple extends boolean,
  Required extends boolean,
> = Multiple extends true
  ? Required extends true
    ? readonly string[]
    : readonly string[] | undefined
  : Required extends true
    ? string
    : string | undefined;

/** The compiled field variant a `(kind, cardinality)` pair builds to. */
type ReferenceFieldOf<
  Kind extends string,
  Multiple extends boolean,
> = Kind extends "entry"
  ? Multiple extends true
    ? EntryListMetaBoxField
    : EntryReferenceMetaBoxField
  : Kind extends "term"
    ? Multiple extends true
      ? TermListMetaBoxField
      : TermReferenceMetaBoxField
    : Kind extends "user"
      ? Multiple extends true
        ? UserListMetaBoxField
        : UserMetaBoxField
      : never;

interface ReferenceFieldState {
  readonly visibleWhen?: MetaFieldCondition;
  readonly label?: Label;
  readonly description?: Label;
  readonly default?: string | readonly string[];
  readonly required?: true;
  readonly multiple?: true;
  readonly returns?: ReferenceReadProjection;
  readonly max?: number;
  readonly span?: MetaBoxFieldSpan;
  readonly capability?: string;
  readonly showInApi?: true;
  readonly sanitize?: (value: unknown) => unknown;
  readonly validate?: MetaBoxFieldValidate;
}

/**
 * Fluent chain shared by the core reference fields (`entry`, `term`,
 * `user`). Immutable — every call returns a fresh instance. The type
 * parameters are the declaration's compile-time state:
 *
 * - `Kind` selects the adapter and, through {@link ReferenceSummaryOf},
 *   the hydrated read shape; it also gates the kind-specific scope
 *   chains (`.roles()` on `user`, `.status()` / `.includeTrashed()` on
 *   `entry`);
 * - `K` is the literal field key;
 * - `Multiple` flips storage + read type to arrays (`.multiple()`);
 * - `Required` narrows the stored shape and, for multi fields, the read
 *   type (`.required()`);
 * - `Returns` swaps the hydrated read for the bare id (`.returns("id")`).
 *
 * All phantom — nothing at runtime carries them. Reads default to the
 * hydrated summary so the typed value never lies about what the read
 * pipeline resolves. The scope object lives on the runtime instance,
 * seeded by the factory and refined by the scope chains.
 */
export class ReferenceFieldBuilder<
  Kind extends string,
  K extends string = string,
  Multiple extends boolean = false,
  Required extends boolean = false,
  Returns extends "id" | "hydrated" = "hydrated",
> implements FieldBuilder {
  /** Phantom literal key of the field — type-level only, never assigned. */
  declare readonly _key: K;
  /** Phantom read type — hydrated summary by default, id after `.returns("id")`. */
  declare readonly _value: ReferenceReadValue<
    ReferenceSummaryOf<Kind>,
    Multiple,
    Required,
    Returns
  >;
  /** Phantom stored shape — bare ids; `.required()` narrows optionality. */
  declare readonly _stored: ReferenceStoredValue<Multiple, Required>;
  /** Phantom cardinality marker backing the compile-time gate on `.multiple()` / `.max()`. */
  declare readonly _multiple: Multiple;

  readonly #kind: Kind;
  readonly #key: string;
  readonly #scope: Record<string, unknown>;
  readonly #state: ReferenceFieldState;

  constructor(
    kind: Kind,
    key: string,
    scope: Record<string, unknown>,
    state: ReferenceFieldState = {},
  ) {
    this.#kind = kind;
    this.#key = key;
    this.#scope = scope;
    this.#state = state;
  }

  #fork<
    Multiple2 extends boolean = Multiple,
    Required2 extends boolean = Required,
    Returns2 extends "id" | "hydrated" = Returns,
  >(
    patch: Partial<ReferenceFieldState>,
    scopePatch?: Record<string, unknown>,
  ): ReferenceFieldBuilder<Kind, K, Multiple2, Required2, Returns2> {
    return new ReferenceFieldBuilder<Kind, K, Multiple2, Required2, Returns2>(
      this.#kind,
      this.#key,
      scopePatch ? { ...this.#scope, ...scopePatch } : this.#scope,
      { ...this.#state, ...patch },
    );
  }

  /**
   * Store an array of ids instead of a single one (`type` flips to
   * `json`, reads become a dense array). Declare cardinality before
   * `.required()` narrows the shapes — the `this`-type gate keeps a
   * post-narrowing `.multiple()` from compiling.
   */
  multiple(
    this: ReferenceFieldBuilder<Kind, K, false, false, Returns>,
  ): ReferenceFieldBuilder<Kind, K, true, false, Returns> {
    return this.#fork<true, false, Returns>({ multiple: true });
  }

  /**
   * Cap the array length — multi-value fields only. Carried on the
   * definition and the wire; the constraint walker enforces it server-side.
   */
  max(
    this: ReferenceFieldBuilder<Kind, K, true, Required, Returns>,
    max: number,
  ): ReferenceFieldBuilder<Kind, K, true, Required, Returns> {
    return this.#fork<true, Required, Returns>({ max });
  }

  /**
   * Read the bare stored id(s) instead of the hydrated summary — opts
   * this field out of the read-time hydration join. Storage and the
   * write contract are unaffected.
   */
  returns(
    shape: "id",
  ): ReferenceFieldBuilder<Kind, K, Multiple, Required, "id"> {
    return this.#fork<Multiple, Required, "id">({ returns: shape });
  }

  /**
   * Mark the field required — enforced at write time by the constraint
   * walker. Narrows the stored shape; a single reference's read stays
   * optional (targets can orphan after the write).
   */
  required(): ReferenceFieldBuilder<Kind, K, Multiple, true, Returns> {
    return this.#fork<Multiple, true, Returns>({ required: true });
  }

  /**
   * Restrict an `entry` reference to a lifecycle status (supersedes the
   * `includeTrashed` default). Public-render consumers pass `"published"`
   * so drafts never surface.
   */
  status(
    this: ReferenceFieldBuilder<"entry", K, Multiple, Required, Returns>,
    status: EntryStatus,
  ): ReferenceFieldBuilder<"entry", K, Multiple, Required, Returns> {
    return this.#fork({}, { status });
  }

  /** Surface trashed entries in an `entry` reference (default: hidden). */
  includeTrashed(
    this: ReferenceFieldBuilder<"entry", K, Multiple, Required, Returns>,
  ): ReferenceFieldBuilder<"entry", K, Multiple, Required, Returns> {
    return this.#fork({}, { includeTrashed: true });
  }

  /** Restrict a `user` reference to these roles (absent → any role). */
  roles(
    this: ReferenceFieldBuilder<"user", K, Multiple, Required, Returns>,
    roles: readonly UserRole[],
  ): ReferenceFieldBuilder<"user", K, Multiple, Required, Returns> {
    return this.#fork({}, { roles });
  }

  /** Surface disabled accounts in a `user` reference (default: hidden). */
  includeDisabled(
    this: ReferenceFieldBuilder<"user", K, Multiple, Required, Returns>,
  ): ReferenceFieldBuilder<"user", K, Multiple, Required, Returns> {
    return this.#fork({}, { includeDisabled: true });
  }

  /** Override the derived (humanized-key) label. */
  label(
    label: Label,
  ): ReferenceFieldBuilder<Kind, K, Multiple, Required, Returns> {
    return this.#fork({ label });
  }

  /** Help text rendered under the label. */
  description(
    description: Label,
  ): ReferenceFieldBuilder<Kind, K, Multiple, Required, Returns> {
    return this.#fork({ description });
  }

  /**
   * Prefill for absent keys — a stored id (or id array for multi
   * fields), seeded into the admin form. Purely a form/decode seed:
   * a reference read stays optional regardless (the default id can
   * itself orphan).
   */
  default(
    value: Multiple extends true ? readonly string[] : string,
  ): ReferenceFieldBuilder<Kind, K, Multiple, Required, Returns> {
    return this.#fork({ default: value });
  }

  /**
   * Column span within the box's 12-column grid — a universal layout
   * hint; surfaces that can't honor it (the entry editor rail) ignore it.
   */
  span(
    span: MetaBoxFieldSpan,
  ): ReferenceFieldBuilder<Kind, K, Multiple, Required, Returns> {
    return this.#fork({ span });
  }

  /** Capability gate for this field — see `MetaBoxFieldBase.capability`. */
  capability(
    capability: string,
  ): ReferenceFieldBuilder<Kind, K, Multiple, Required, Returns> {
    return this.#fork({ capability });
  }

  /** Opt this field's value into public REST responses (default-deny). */
  showInApi(): ReferenceFieldBuilder<Kind, K, Multiple, Required, Returns> {
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
    this: ReferenceFieldBuilder<Kind, K, true, Required, Returns>,
    id: string,
  ): MetaFieldConditionRule {
    return { key: this.#key, op: "contains", value: id };
  }

  /** Rule factory: the selection does not include `id` — multi-value only. */
  notContains(
    this: ReferenceFieldBuilder<Kind, K, true, Required, Returns>,
    id: string,
  ): MetaFieldConditionRule {
    return { key: this.#key, op: "not_contains", value: id };
  }

  /**
   * Show this field only when every rule passes (one AND group) — rules
   * come from sibling fields' condition factories. Replaces any
   * previously declared condition; `.orVisibleWhen()` adds alternatives.
   */
  visibleWhen(
    ...rules: MetaFieldConditionRule[]
  ): ReferenceFieldBuilder<Kind, K, Multiple, Required, Returns> {
    return this.#fork({ visibleWhen: [rules] });
  }

  /** Add an OR alternative — one more AND group of rules. */
  orVisibleWhen(
    ...rules: MetaFieldConditionRule[]
  ): ReferenceFieldBuilder<Kind, K, Multiple, Required, Returns> {
    return this.#fork({
      visibleWhen: [...(this.#state.visibleWhen ?? []), rules],
    });
  }

  /**
   * Normalising transform, applied after coercion and before
   * persistence. Receives the stored id(s) — the read-time hydration is
   * a separate, later step.
   */
  sanitize(
    sanitize: (value: unknown) => unknown,
  ): ReferenceFieldBuilder<Kind, K, Multiple, Required, Returns> {
    return this.#fork({ sanitize });
  }

  /**
   * Custom validation — `true` for valid, or an i18n-able failure
   * message (sync or async). Runs after `.sanitize()` and the
   * declarative constraints.
   */
  validate(
    validate: MetaBoxFieldValidate,
  ): ReferenceFieldBuilder<Kind, K, Multiple, Required, Returns> {
    return this.#fork({ validate });
  }

  /** Compile the chain into the wire/manifest field definition. */
  build(): ReferenceFieldOf<Kind, Multiple> {
    const { multiple, ...state } = this.#state;
    const target: ReferenceTarget = multiple
      ? { kind: this.#kind, scope: this.#scope, multiple: true }
      : { kind: this.#kind, scope: this.#scope };
    const field = {
      ...state,
      key: this.#key,
      label: state.label ?? humanizeFieldKey(this.#key),
      type: multiple ? "json" : "string",
      inputType: multiple ? `${this.#kind}List` : this.#kind,
      referenceTarget: target,
    };
    return field as ReferenceFieldOf<Kind, Multiple>;
  }
}

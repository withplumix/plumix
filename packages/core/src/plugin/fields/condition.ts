// Conditional-visibility rule model for meta-box fields. Rules are
// plain wire objects addressing driver fields by key — authored via
// the typed condition factories on each fluent builder, serialized
// into the manifest untouched, and evaluated by the same
// `isFieldVisible` on both sides: the admin form (live show/hide as
// driver values change) and the server write pipeline (hidden fields
// skip validation).

/** Comparison applied between a driver field's value and the rule. */
export type MetaFieldConditionOperator =
  | "eq"
  | "neq"
  | "empty"
  | "not_empty"
  | "gt"
  | "lt"
  | "contains"
  | "not_contains"
  | "count_gt"
  | "count_lt";

/**
 * One comparison against a driver field, addressed by its meta key.
 * `value` is the JSON-serializable comparand; operators that don't
 * compare against a value omit it.
 */
export interface MetaFieldConditionRule {
  readonly key: string;
  readonly op: MetaFieldConditionOperator;
  readonly value?: unknown;
}

/**
 * OR-of-AND groups: the field is visible when any group passes, and a
 * group passes when all of its rules do. `.visibleWhen(...rules)`
 * authors the first group; each `.orVisibleWhen(...rules)` appends one.
 */
export type MetaFieldCondition = readonly (readonly MetaFieldConditionRule[])[];

/**
 * Evaluate a field's visibility against the sibling values of its box
 * (form values in the admin, the incoming meta bag on the server). A
 * field without a condition is always visible.
 */
export function isFieldVisible(
  field: { readonly visibleWhen?: MetaFieldCondition },
  values: Readonly<Record<string, unknown>>,
): boolean {
  const groups = field.visibleWhen;
  if (groups === undefined || groups.length === 0) return true;
  return groups.some((group) =>
    group.every((rule) => evaluateRule(rule, values[rule.key])),
  );
}

/**
 * Write-side companion to `isFieldVisible`: whether a field's key
 * should be dropped from an incoming write. Condition-hidden fields
 * skip validation entirely, because an editor can never fix a value
 * behind an input they cannot see. Visibility is judged from the
 * incoming bag (the admin submits the full form state), and only when
 * the bag carries every referenced driver: a partial patch that omits
 * a driver is validated as if visible rather than silently dropped on
 * unknown driver state.
 */
export function isConditionHidden(
  field: { readonly visibleWhen?: MetaFieldCondition },
  input: Readonly<Record<string, unknown>>,
): boolean {
  const groups = field.visibleWhen ?? [];
  const driversPresent = groups.every((group) =>
    group.every((rule) => rule.key in input),
  );
  return driversPresent && !isFieldVisible(field, input);
}

function evaluateRule(rule: MetaFieldConditionRule, value: unknown): boolean {
  switch (rule.op) {
    case "eq":
      return structurallyEqual(value, rule.value);
    case "neq":
      return !structurallyEqual(value, rule.value);
    case "empty":
      return isEmptyValue(value);
    case "not_empty":
      return !isEmptyValue(value);
    case "gt":
      return compareNumeric(value, rule.value, (a, b) => a > b);
    case "lt":
      return compareNumeric(value, rule.value, (a, b) => a < b);
    case "contains":
      return containsItem(value, rule.value);
    case "not_contains":
      return !containsItem(value, rule.value);
    case "count_gt":
      return compareNumeric(countOf(value), rule.value, (a, b) => a > b);
    case "count_lt":
      return compareNumeric(countOf(value), rule.value, (a, b) => a < b);
  }
}

function containsItem(value: unknown, comparand: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.some((item: unknown) => structurallyEqual(item, comparand))
  );
}

// Multi-value drivers count their selections; anything else (including
// an absent value) counts as zero.
function countOf(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

// JSON-structural equality — rule comparands are JSON-serializable by
// construction (typed factories produce them from field value types),
// so array order and own enumerable keys are the identity. Objects
// compare key-order-insensitively.
function structurallyEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length &&
      a.every((item: unknown, i) => structurallyEqual(item, b[i]))
    );
  }
  if (
    typeof a === "object" &&
    typeof b === "object" &&
    a !== null &&
    b !== null &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const aEntries = Object.entries(a);
    if (aEntries.length !== Object.keys(b).length) return false;
    return aEntries.every(
      ([key, item]) =>
        key in b &&
        structurallyEqual(item, (b as Record<string, unknown>)[key]),
    );
  }
  return false;
}

// "No value yet" as an editor perceives it: unset, cleared input, or
// an empty multi-value selection. `false` / `0` are values.
function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  return Array.isArray(value) && value.length === 0;
}

function compareNumeric(
  value: unknown,
  bound: unknown,
  cmp: (a: number, b: number) => boolean,
): boolean {
  const parsed = numericValueOf(value);
  return (
    parsed !== undefined && typeof bound === "number" && cmp(parsed, bound)
  );
}

// Numeric driver values may arrive as strings (an HTML number input's
// raw form value) — accept them, but never coerce blank to 0.
function numericValueOf(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

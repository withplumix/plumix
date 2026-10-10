import * as v from "valibot";

import type { JsonValue } from "../json.js";
import type { MetaScalarType } from "../plugin/manifest.js";

// The admin form sends native-input strings and direct RPC callers send
// whatever they like; both funnel into the declared scalar or fail.

const stringSchema = v.union([
  v.string(),
  v.pipe(v.number(), v.finite(), v.transform(String)),
  v.pipe(v.boolean(), v.transform(String)),
]);

const numberSchema = v.union([
  v.pipe(v.number(), v.finite()),
  // Empty strings come from cleared form inputs; the admin dispatcher
  // already sends `null` for those, but a direct RPC caller might send
  // "" — reject rather than silently coerce to 0 (`Number("") === 0`).
  v.pipe(v.string(), v.trim(), v.minLength(1), v.transform(Number), v.finite()),
  v.pipe(v.boolean(), v.transform(Number)),
]);

const booleanSchema = v.union([
  v.boolean(),
  v.pipe(
    v.union([v.literal(1), v.literal("1"), v.literal("true")]),
    v.transform(() => true),
  ),
  v.pipe(
    v.union([v.literal(0), v.literal("0"), v.literal("false")]),
    v.transform(() => false),
  ),
]);

// The standard library under-types both: `stringify` can return `undefined`,
// and `parse` of a string this module produced is JSON by construction.
const stringifyJson: (value: unknown) => string | undefined = JSON.stringify;
const parseJson: (text: string) => JsonValue = JSON.parse;

/**
 * `undefined` when the value has no serialization (BigInt, function, Symbol)
 * rather than storing something a reader can't get back.
 */
export function decodeJsonValue(value: unknown): JsonValue | undefined {
  let encoded: string | undefined;
  try {
    encoded = stringifyJson(value);
  } catch {
    return undefined;
  }
  return encoded === undefined ? undefined : parseJson(encoded);
}

type Coerced =
  { readonly ok: true; readonly value: JsonValue } | { readonly ok: false };

const COERCE_FAIL: Coerced = { ok: false };

const SCALAR_SCHEMAS = {
  string: stringSchema,
  number: numberSchema,
  boolean: booleanSchema,
} as const;

/** Decode one value into the storage shape its field declares. */
export function coerceValue(type: MetaScalarType, value: unknown): Coerced {
  if (type === "json") {
    const decoded = decodeJsonValue(value);
    return decoded === undefined ? COERCE_FAIL : { ok: true, value: decoded };
  }
  const result = v.safeParse(SCALAR_SCHEMAS[type], value);
  return result.success ? { ok: true, value: result.output } : COERCE_FAIL;
}

// A hydrated reference payload as it comes back off a read: the lookup
// adapter's row, of which only the id is ever stored.
const referencePayloadSchema = v.object({ id: v.string() });

/**
 * Returns the `id` string of a `{ id: string, ... }` object, or null
 * for any other shape (string, array, null, primitive, missing key).
 */
export function extractStringId(value: unknown): string | null {
  const parsed = v.safeParse(referencePayloadSchema, value);
  return parsed.success ? parsed.output.id : null;
}

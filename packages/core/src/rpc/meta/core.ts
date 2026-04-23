import type { SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

import type { AppContext } from "../../context/app.js";
import type { MetaBoxField, MetaScalarType } from "../../plugin/manifest.js";
import { eq } from "../../db/index.js";

// Shared meta plumbing for every entity that stores a `meta` JSON
// column (entries, terms, and — eventually — users). The storage
// contract: writes merge into the bag via SQLite `json_set` /
// `json_remove`; reads come back already-parsed via drizzle's
// `mode: "json"`. Per-entity specializations in `procedures/{entry,
// term}/meta.ts` thread the right table + action name through these
// helpers.

/** Per-value byte cap after JSON encoding. 256 KiB fits any realistic
 *  plugin config while bounding adversarial payloads. */
const MAX_META_VALUE_BYTES = 256 * 1024;

export type MetaMap = Record<string, unknown>;

/**
 * Validated meta patch produced by `sanitizeMetaInput`. Values in
 * `upserts` are the *decoded* post-sanitization objects — filter hooks
 * see this shape, so keeping decoded values here means a plugin
 * doesn't have to double-parse. `applyMetaPatch` JSON-encodes at the
 * last moment, before the UPDATE.
 */
export interface MetaPatch {
  readonly upserts: ReadonlyMap<string, unknown>;
  readonly deletes: readonly string[];
}

/**
 * Reason codes are part of the RPC error `data.reason` surface — admin
 * UIs and plugin tests match on these strings, so treat them as a
 * public contract.
 */
export type MetaSanitizationReason =
  | "not_registered"
  | "scope_mismatch"
  | "invalid_value"
  | "value_too_large";

export class MetaSanitizationError extends Error {
  readonly key: string;
  readonly reason: MetaSanitizationReason;
  constructor(key: string, reason: MetaSanitizationReason) {
    super(`meta key "${key}" failed sanitization: ${reason}`);
    this.key = key;
    this.reason = reason;
  }
}

/**
 * Minimum shape of the oRPC `errors` object needed to surface a
 * `MetaSanitizationError` as a CONFLICT. Declared structurally so this
 * helper doesn't have to import oRPC types — the handler passes its
 * `errors` in and TS matches on shape.
 */
export interface RpcErrorsForMeta {
  CONFLICT: (args: { data: { reason: string; key?: string } }) => Error;
}

/**
 * Standard payload for `<entity>:meta_changed` actions. `set` is the
 * decoded key → value map of upserts; `removed` is the list of
 * cleared keys.
 */
export interface MetaChanges {
  readonly set: Readonly<Record<string, unknown>>;
  readonly removed: readonly string[];
}

/**
 * Validate an incoming meta map against a field-lookup fn produced by
 * the caller (entry vs term differ only in which registry they walk).
 * Unregistered keys and type-coercion failures throw so the caller can
 * surface them as 4xx before any write. `null` / `undefined` values
 * are deletion requests; everything else is coerced + sanitized.
 */
export function sanitizeMetaInput(
  findField: (key: string) => MetaBoxField | undefined,
  input: MetaMap | undefined,
): MetaPatch | null {
  if (input === undefined) return null;
  const upserts = new Map<string, unknown>();
  const deletes: string[] = [];
  for (const [key, rawValue] of Object.entries(input)) {
    const field = findField(key);
    if (!field) {
      throw new MetaSanitizationError(key, "not_registered");
    }
    if (rawValue === null || rawValue === undefined) {
      deletes.push(key);
      continue;
    }
    const coerced = coerceToType(field.type, key, rawValue);
    const sanitized = field.sanitize ? field.sanitize(coerced) : coerced;
    assertEncodedSize(key, sanitized);
    upserts.set(key, sanitized);
  }
  return { upserts, deletes };
}

/**
 * Thin wrapper that translates a thrown `MetaSanitizationError` into
 * the RPC handler's CONFLICT envelope.
 */
export function sanitizeMetaForRpc(
  findField: (key: string) => MetaBoxField | undefined,
  input: MetaMap | undefined,
  errors: RpcErrorsForMeta,
): MetaPatch | null {
  try {
    return sanitizeMetaInput(findField, input);
  } catch (error) {
    if (error instanceof MetaSanitizationError) {
      throw errors.CONFLICT({
        data: { reason: `meta_${error.reason}`, key: error.key },
      });
    }
    throw error;
  }
}

/**
 * Decode a raw meta bag (as returned by drizzle's JSON-mode column)
 * into the plugin-typed shape RPC consumers expect. Unregistered keys
 * pass through untouched — the row exists in the DB but the plugin
 * that wrote it is no longer installed; we don't pretend to know its
 * shape.
 */
export function decodeMetaBag(
  findField: (key: string) => MetaBoxField | undefined,
  raw: Readonly<Record<string, unknown>> | null | undefined,
): MetaMap {
  if (!raw) return {};
  const out: MetaMap = {};
  for (const [key, value] of Object.entries(raw)) {
    const field = findField(key);
    out[key] = field ? coerceOnRead(field.type, value) : value;
  }
  return out;
}

export function isEmptyMetaPatch(patch: MetaPatch | null): boolean {
  return (
    patch === null || (patch.upserts.size === 0 && patch.deletes.length === 0)
  );
}

/**
 * Merge a validated patch into the given `meta` JSON column for the
 * row identified by `idColumn = id`. Uses SQLite `json_set` /
 * `json_remove` so concurrent updaters touching disjoint keys don't
 * clobber each other at the row level. Deletes nest inside sets so a
 * caller clearing + re-setting the same key in one request behaves
 * predictably.
 */
export async function applyMetaPatch<
  TTable extends { meta: SQLiteColumn },
>(
  ctx: AppContext,
  table: TTable,
  idColumn: SQLiteColumn,
  id: number,
  patch: MetaPatch,
): Promise<void> {
  if (isEmptyMetaPatch(patch)) return;

  let expr: SQL = sql`${table.meta}`;
  if (patch.deletes.length > 0) {
    const paths = patch.deletes.map((k) => sql`${metaJsonPath(k)}`);
    expr = sql`json_remove(${expr}, ${sql.join(paths, sql`, `)})`;
  }
  if (patch.upserts.size > 0) {
    const pairs = Array.from(
      patch.upserts,
      ([key, value]) =>
        sql`${metaJsonPath(key)}, json(${JSON.stringify(value)})`,
    );
    expr = sql`json_set(${expr}, ${sql.join(pairs, sql`, `)})`;
  }

  await ctx.db
    // drizzle's `update(table)` wants an `AnyTable` shape; our generic
    // constraint only pins `meta`, so the update helper accepts any
    // sqlite table via structural matching. Cast keeps the helper
    // reusable across tables without widening the public types.
    .update(table as never)
    .set({ meta: expr })
    .where(eq(idColumn, id));
}

/**
 * Load + decode the full meta bag for a single row. Returns empty
 * when the row is missing (deleted mid-flight) or has no saved meta.
 */
export async function loadMeta<TTable extends { meta: SQLiteColumn }>(
  ctx: AppContext,
  table: TTable,
  idColumn: SQLiteColumn,
  id: number,
  findField: (key: string) => MetaBoxField | undefined,
): Promise<MetaMap> {
  const [row] = (await ctx.db
    .select({ meta: table.meta })
    .from(table as never)
    .where(eq(idColumn, id))) as { meta: unknown }[];
  return decodeMetaBag(findField, row?.meta as MetaMap | undefined);
}

// --- internals below ---------------------------------------------------

function coerceToType(
  type: MetaScalarType,
  key: string,
  value: unknown,
): unknown {
  switch (type) {
    case "string":
      return coerceString(key, value);
    case "number":
      return coerceNumber(key, value);
    case "boolean":
      return coerceBoolean(key, value);
    case "json":
      return coerceJson(key, value);
  }
}

function coerceString(key: string, value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  throw new MetaSanitizationError(key, "invalid_value");
}

function coerceNumber(key: string, value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    // Empty string comes from cleared form inputs; the admin dispatcher
    // already sends `null` for those, but a direct RPC caller might send
    // "" — reject here so we don't silently coerce to 0 (`Number("") === 0`).
    if (value.trim() === "") {
      throw new MetaSanitizationError(key, "invalid_value");
    }
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  throw new MetaSanitizationError(key, "invalid_value");
}

function coerceBoolean(key: string, value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  throw new MetaSanitizationError(key, "invalid_value");
}

function coerceJson(key: string, value: unknown): unknown {
  // json keys take anything round-trippable through JSON.stringify —
  // we reject values that throw (BigInt) or silently drop (functions,
  // Symbols) so reads don't hand back `undefined` for something a
  // plugin thought it stored. TS types JSON.stringify as always-
  // string, but at runtime it returns `undefined` for unserializable
  // inputs — hence the cast.
  try {
    const encoded = JSON.stringify(value) as string | undefined;
    if (encoded === undefined) {
      throw new MetaSanitizationError(key, "invalid_value");
    }
    return JSON.parse(encoded);
  } catch {
    throw new MetaSanitizationError(key, "invalid_value");
  }
}

function assertEncodedSize(key: string, value: unknown): void {
  const encoded = JSON.stringify(value) as string | undefined;
  if (encoded === undefined) return; // already caught in coerceJson
  const byteLength = new TextEncoder().encode(encoded).length;
  if (byteLength > MAX_META_VALUE_BYTES) {
    throw new MetaSanitizationError(key, "value_too_large");
  }
}

function coerceOnRead(type: MetaScalarType, value: unknown): unknown {
  // Reads are forgiving — the row was validated on write but a
  // schema change (e.g. a plugin flipping `number` → `string`)
  // shouldn't 500 the editor. We coerce when we can and fall through
  // to the raw value otherwise.
  switch (type) {
    case "string":
      return typeof value === "string" ? value : String(value);
    case "number":
      return typeof value === "number" ? value : Number(value);
    case "boolean":
      return typeof value === "boolean" ? value : Boolean(value);
    case "json":
      return value;
  }
}

// SQLite's JSON path `$.label` only accepts `[A-Za-z0-9_]` in unquoted
// labels, but valid meta keys may include `-` or `:` (see the input
// schema regex). The double-quoted label form `$."foo-bar"` handles
// them; interpolation is safe because keys are pre-validated to
// exclude `"` and `\`.
function metaJsonPath(key: string): string {
  return `$."${key}"`;
}

import type { SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

import type { AppContext } from "../../context/app.js";
import type { LookupAdapter } from "../../plugin/lookup.js";
import type {
  MetaBoxField,
  MetaScalarType,
  ReferenceTarget,
} from "../../plugin/manifest.js";
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

type MetaMap = Record<string, unknown>;

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
type MetaSanitizationReason =
  | "not_registered"
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
interface RpcErrorsForMeta {
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
    const sanitized = field.sanitize
      ? runSanitize(field.sanitize, key, coerced)
      : coerced;
    assertEncodedSize(key, sanitized);
    upserts.set(key, sanitized);
  }
  return { upserts, deletes };
}

/**
 * Run a field's sanitize callback inside a try/catch — any thrown
 * `MetaSanitizationError` propagates as-is (so callbacks that already
 * use the precise error type can opt into specific reasons), but
 * generic errors (including plain `Error("invalid_value")` thrown
 * from builder-injected default sanitizers) are translated into a
 * uniform `invalid_value` failure. Callbacks therefore stay free to
 * throw vanilla errors without importing the package-internal error
 * class.
 */
function runSanitize(
  sanitize: (value: unknown) => unknown,
  key: string,
  value: unknown,
): unknown {
  try {
    return sanitize(value);
  } catch (error) {
    if (error instanceof MetaSanitizationError) throw error;
    // Buggy sanitize callbacks otherwise round to a generic
    // `invalid_value` envelope, which is fine for the editor's UX
    // but loses the underlying stack. Log it before translating so
    // server logs preserve the diagnostic trail.
    console.error(
      `[plumix] sanitize callback for meta key "${key}" threw:`,
      error,
    );
    throw new MetaSanitizationError(key, "invalid_value");
  }
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
 * Walk a sanitized patch, group every reference upsert by
 * `(kind, scope)`, and issue one `LookupAdapter.list({ ids })`
 * query per group to confirm all upserted IDs are real and in
 * scope **at validation time**. Throws `invalid_value` for any id
 * missing from its group's live-id set — same surface whether the
 * adapter is unregistered, the target is gone, or scope rejected
 * it. Sync `sanitize` callbacks can't run DB queries, so this is a
 * separate async step the RPC procedures invoke between
 * sanitisation and `applyMetaPatch`.
 *
 * TOCTOU note: validate runs in a separate query from the eventual
 * `applyMetaPatch`, and callers don't share a transaction. A
 * concurrent delete between validate and apply leaves an orphan id
 * in the meta bag; `filterMetaOrphans` masks it on read. Wrap the
 * validate/apply pair in `ctx.db.transaction()` if a caller needs
 * serializable consistency.
 */
export async function validateMetaReferences(
  ctx: AppContext,
  findField: (key: string) => MetaBoxField | undefined,
  patch: MetaPatch,
): Promise<void> {
  const groups = new Map<string, ReferenceGroup>();
  for (const [key, value] of patch.upserts) {
    const field = findField(key);
    const target = referenceTargetOf(field);
    if (!target) continue;
    const registered = ctx.plugins.lookupAdapters.get(target.kind);
    if (!registered) {
      throw new MetaSanitizationError(key, "invalid_value");
    }
    const ids = referenceIdsForValidation(key, value, target, fieldMax(field));
    const groupKey = referenceGroupKey(target);
    let group = groups.get(groupKey);
    if (!group) {
      group = { registered, scope: target.scope, ids: new Set(), keys: [] };
      groups.set(groupKey, group);
    }
    for (const id of ids) group.ids.add(id);
    group.keys.push({ key, ids });
  }
  for (const group of groups.values()) {
    if (group.ids.size === 0) continue;
    const liveIds = await fetchLiveIds(
      ctx,
      group.registered,
      group.scope,
      group.ids,
      "validateMetaReferences",
    );
    for (const upsert of group.keys) {
      for (const id of upsert.ids) {
        if (!liveIds.has(id)) {
          throw new MetaSanitizationError(upsert.key, "invalid_value");
        }
      }
    }
  }
}

interface ReferenceGroup {
  readonly registered: { readonly adapter: LookupAdapter };
  readonly scope: unknown;
  // De-duped ids across every field in this group — one query
  // resolves them all regardless of how many fields reference them.
  readonly ids: Set<string>;
  // Upsert-side: which keys contributed which ids, so a missing
  // live-id can be attributed back to the field that supplied it.
  readonly keys: { readonly key: string; readonly ids: readonly string[] }[];
}

// Defense-in-depth ceiling on the internal-aggregated id-batch size.
// Above this, the live-id fetch throws rather than silently truncating.
// The wire cap (100) and per-field cap (`HARD_MULTI_REFERENCE_LIMIT`,
// 100) keep external + per-field batches small; this ceiling only
// kicks in if many fields share `(kind, scope)` and aggregate.
const MAX_REFERENCE_GROUP_BATCH = 1000;

// Same kind + same scope = same SQL filter, so they batch into one
// `list({ ids })` call. JSON.stringify is good enough for the scope
// shapes we ship (`UserFieldScope`, `EntryFieldScope`,
// `TermFieldScope` are all simple objects with stable key order at
// build time). Plugin authors who construct scopes with non-stable
// key order get separate groups — extra query, no correctness issue.
//
// `::` separator is collision-safe by construction: `kind` is
// constrained to `[a-z][a-z0-9_-]{0,63}` (no colons) by the lookup
// RPC schema, and core registers `user`/`entry`/`term` directly.
//
// `LookupAdapter` requires JSON-serializable scope; rethrow with a
// clear message if `JSON.stringify` rejects (BigInt, cycle, function)
// rather than letting the downstream read crash with a generic.
function referenceGroupKey(target: ReferenceTarget): string {
  try {
    return `${target.kind}::${JSON.stringify(target.scope ?? null)}`;
  } catch (cause) {
    throw new Error(
      `lookup adapter scope for kind "${target.kind}" must be JSON-serializable`,
      { cause },
    );
  }
}

// Run one `list({ ids })` per group, throwing if the aggregated batch
// blew past `MAX_REFERENCE_GROUP_BATCH`. The wire schema caps `ids` at
// 100 per-request and `HARD_MULTI_REFERENCE_LIMIT` caps each field at
// 100, so we only hit the ceiling when many fields share `(kind, scope)`
// and aggregate — at which point throwing beats silent truncation
// (truncation would either reject valid writes or hide live targets).
async function fetchLiveIds(
  ctx: AppContext,
  registered: { readonly adapter: LookupAdapter },
  scope: unknown,
  ids: ReadonlySet<string>,
  callsite: string,
): Promise<ReadonlySet<string>> {
  if (ids.size > MAX_REFERENCE_GROUP_BATCH) {
    throw new Error(
      `${callsite}: aggregated batch size ${ids.size} exceeds MAX_REFERENCE_GROUP_BATCH (${MAX_REFERENCE_GROUP_BATCH})`,
    );
  }
  const idList = [...ids];
  const rows = await registered.adapter.list(ctx, {
    ids: idList,
    scope,
    limit: idList.length,
  });
  return new Set(rows.map((row) => row.id));
}

// Defensive upper bound on multi-reference array length, applied
// per-field before grouping. Even with the batched `list({ ids })`
// path, an unbounded array still pulls 10k rows in one query — the
// cap protects the wire / response size. 100 covers any realistic
// multi-reference field (authors, tags, related entries); fields
// can declare a lower `max` and the validator picks the smaller.
const HARD_MULTI_REFERENCE_LIMIT = 100;

// Multi-reference (`userList` / `entryList` / etc.): value must be a
// string array of non-empty strings, capped by both the hard limit
// above and the field's optional `max`. Single-reference: value
// must be a string. Returns the IDs that feed the group's batched
// `list({ ids })` call in `validateMetaReferences`.
function referenceIdsForValidation(
  key: string,
  value: unknown,
  target: ReferenceTarget,
  max: number | undefined,
): readonly string[] {
  if (target.multiple) {
    if (!Array.isArray(value)) {
      throw new MetaSanitizationError(key, "invalid_value");
    }
    if (value.length > HARD_MULTI_REFERENCE_LIMIT) {
      throw new MetaSanitizationError(key, "value_too_large");
    }
    if (max !== undefined && value.length > max) {
      throw new MetaSanitizationError(key, "invalid_value");
    }
    for (const item of value) {
      if (typeof item !== "string" || item === "") {
        throw new MetaSanitizationError(key, "invalid_value");
      }
    }
    return value as readonly string[];
  }
  if (typeof value !== "string") {
    throw new MetaSanitizationError(key, "invalid_value");
  }
  return [value];
}

function fieldMax(field: MetaBoxField | undefined): number | undefined {
  return (field as { readonly max?: number } | undefined)?.max;
}

/**
 * RPC-shaped wrapper around `validateMetaReferences` — same envelope
 * translation as `sanitizeMetaForRpc`. Procedures call this right
 * after `sanitizeMetaForRpc` so reference validation rides on the
 * same `meta_invalid_value` error surface authors already match on.
 */
export async function validateMetaReferencesForRpc(
  ctx: AppContext,
  findField: (key: string) => MetaBoxField | undefined,
  patch: MetaPatch,
  errors: RpcErrorsForMeta,
): Promise<void> {
  try {
    await validateMetaReferences(ctx, findField, patch);
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
 * Resolve reference fields in a decoded meta bag, dropping any
 * stored ID whose target is gone (or no longer matches scope).
 * Single-reference orphans become `null`; multi-reference orphans
 * are removed from the array (which stays dense, in order). Caller
 * passes a freshly-decoded bag (e.g. from `decodeMetaBag`); the
 * returned bag is a shallow copy with orphans handled. Non-reference
 * keys pass through untouched.
 *
 * Two-pass: first walk groups every reference key by `(kind, scope)`
 * and issues one `LookupAdapter.list({ ids })` per group; second
 * walk applies the live-id sets. So a meta bag with five user-refs,
 * three entry-refs, and two term-refs costs three queries total —
 * not ten. Adapter `list` honours `scope` (`entryTypes`,
 * `termTaxonomies`, `roles`, …) so out-of-scope ids fall out of the
 * result naturally and read as orphans.
 */
export async function filterMetaOrphans(
  ctx: AppContext,
  findField: (key: string) => MetaBoxField | undefined,
  decoded: MetaMap,
): Promise<MetaMap> {
  // Pass 1: classify each reference key, cache the per-key triple, and
  // accumulate ids per `(kind, scope)` group. Pass 3 walks the cache
  // directly so it doesn't redo the findField / registry lookups.
  interface Candidate {
    readonly key: string;
    readonly multiple: boolean;
    readonly groupKey: string;
    readonly ids: readonly string[];
  }
  const candidates: Candidate[] = [];
  const groups = new Map<
    string,
    {
      readonly registered: { readonly adapter: LookupAdapter };
      readonly scope: unknown;
      readonly ids: Set<string>;
    }
  >();
  for (const [key, value] of Object.entries(decoded)) {
    const target = referenceTargetOf(findField(key));
    if (!target) continue;
    const registered = ctx.plugins.lookupAdapters.get(target.kind);
    if (!registered) continue;
    const ids = orphanCandidateIds(target, value);
    if (ids === null) continue; // non-array multi / non-string single — leave untouched
    const groupKey = referenceGroupKey(target);
    candidates.push({ key, multiple: target.multiple === true, groupKey, ids });
    if (ids.length === 0) continue; // empty array — apply step still runs, no group work
    let group = groups.get(groupKey);
    if (!group) {
      group = { registered, scope: target.scope, ids: new Set() };
      groups.set(groupKey, group);
    }
    for (const id of ids) group.ids.add(id);
  }

  // Pass 2: one `list({ ids })` per group, keyed for O(1) apply lookup.
  const liveIdsByGroup = new Map<string, ReadonlySet<string>>();
  for (const [groupKey, group] of groups) {
    liveIdsByGroup.set(
      groupKey,
      await fetchLiveIds(
        ctx,
        group.registered,
        group.scope,
        group.ids,
        "filterMetaOrphans",
      ),
    );
  }

  // Pass 3: apply the filter. Orphan handling differs single vs multi.
  const out: MetaMap = { ...decoded };
  const empty: ReadonlySet<string> = new Set();
  for (const { key, multiple, groupKey, ids } of candidates) {
    const liveIds = liveIdsByGroup.get(groupKey) ?? empty;
    if (multiple) {
      out[key] = ids.filter((id) => liveIds.has(id));
      continue;
    }
    const [singleId] = ids;
    if (singleId === undefined) continue; // single non-string already filtered upstream
    if (!liveIds.has(singleId)) out[key] = null;
  }
  return out;
}

// Returns `null` to mean "no candidates from this key" (skip), or
// the ids to feed into the group's batch query. Mirrors the storage-
// shape guards in the apply step so we don't enqueue work that's
// going to be skipped.
function orphanCandidateIds(
  target: ReferenceTarget,
  value: unknown,
): readonly string[] | null {
  if (target.multiple) {
    if (!Array.isArray(value)) return null;
    return value.filter((id): id is string => typeof id === "string");
  }
  return typeof value === "string" ? [value] : null;
}

function referenceTargetOf(
  field: MetaBoxField | undefined,
): ReferenceTarget | undefined {
  if (!field) return undefined;
  return (field as { readonly referenceTarget?: ReferenceTarget })
    .referenceTarget;
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
export async function applyMetaPatch<TTable extends { meta: SQLiteColumn }>(
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

// Mirror the write-side accepted tokens instead of `Boolean(value)` — the
// latter would flip `"false"` → `true`, silently inverting rows persisted
// via `type: "json"` before a plugin tightened the field to `boolean`.
const TRUTHY_BOOLEAN_TOKENS: ReadonlySet<unknown> = new Set([1, "1", "true"]);
const FALSY_BOOLEAN_TOKENS: ReadonlySet<unknown> = new Set([0, "0", "false"]);

function coerceBooleanOnRead(value: unknown): unknown {
  if (typeof value === "boolean") return value;
  if (TRUTHY_BOOLEAN_TOKENS.has(value)) return true;
  if (FALSY_BOOLEAN_TOKENS.has(value)) return false;
  return value;
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
      return coerceBooleanOnRead(value);
    case "json":
      return value;
  }
}

// SQLite's JSON path `$.label` only accepts `[A-Za-z0-9_]` in unquoted
// labels, but valid meta keys may include `-` or `:` (see the input
// schema regex). The double-quoted label form `$."foo-bar"` handles
// them; the RPC input schema already rejects `"` and `\`, but belt-and-
// braces matters here because non-RPC callers (tests, hook listeners,
// future surfaces) could bypass that schema and trigger SQL injection
// via a crafted path.
function metaJsonPath(key: string): string {
  if (/["\\]/.test(key)) {
    throw new Error(
      `meta key "${key}" contains characters forbidden in a JSON path`,
    );
  }
  return `$."${key}"`;
}

import { sql } from "drizzle-orm";

import type { AppContext } from "../../../context/app.js";
import type {
  MetaScalarType,
  PluginRegistry,
  RegisteredMeta,
} from "../../../plugin/manifest.js";
import { and, eq, inArray } from "../../../db/index.js";
import { postMeta } from "../../../db/schema/post_meta.js";

// The unfortunate truth about post meta is that the store is a single TEXT
// column: we can only round-trip values via JSON. That's fine for what we
// support today (`string` / `number` / `boolean` / `json`) but we pay for
// it with an encode/decode pair and an allowlist of types the registry is
// willing to hydrate on read.

/**
 * Hard cap on the JSON-encoded size of a single meta value, in bytes.
 * 256KiB fits any realistic plugin-shaped JSON config while bounding the
 * damage an adversarial writer can do — WordPress's TEXT column tops out
 * around 64KiB, so this is already more generous than the incumbent.
 * Enforced in `coerceToType` rather than the valibot schema so plugin
 * authors can calibrate per key via a custom `sanitize` if they need
 * tighter bounds.
 */
const MAX_META_VALUE_BYTES = 256 * 1024;

type PostMetaMap = Record<string, unknown>;

/**
 * Validated meta patch produced by `sanitizeMetaInput`. Values in
 * `upserts` are the *decoded* post-sanitization objects — the `MetaPatch`
 * is what filter hooks see, so keeping decoded values here means a
 * plugin doesn't have to double-parse. `applyMetaPatch` JSON-encodes at
 * the last moment, before the INSERT.
 */
export interface MetaPatch {
  readonly upserts: ReadonlyMap<string, unknown>;
  readonly deletes: readonly string[];
}

/**
 * Validate an incoming meta map against the plugin registry and produce a
 * DB-ready patch. Unregistered keys, keys registered for a different
 * post type, and type-coercion failures all throw so the caller can
 * surface them as 4xx before any write. `null` / `undefined` values are
 * deletion requests; everything else is coerced + sanitized.
 */
export function sanitizeMetaInput(
  registry: PluginRegistry,
  postType: string,
  input: PostMetaMap | undefined,
): MetaPatch | null {
  if (input === undefined) return null;
  const upserts = new Map<string, unknown>();
  const deletes: string[] = [];
  for (const [key, rawValue] of Object.entries(input)) {
    const definition = registry.metaKeys.get(key);
    if (!definition) {
      throw new MetaSanitizationError(key, "not_registered");
    }
    if (!definition.postTypes.includes(postType)) {
      throw new MetaSanitizationError(key, "post_type_mismatch");
    }
    if (rawValue === null || rawValue === undefined) {
      deletes.push(key);
      continue;
    }
    const coerced = coerceToType(definition, rawValue);
    const sanitized = definition.sanitize
      ? definition.sanitize(coerced)
      : coerced;
    // Encoded-size check guards the DB against a 10MB-in-one-request abuse
    // path. Re-encoding in applyMetaPatch is cheap so we accept the double
    // stringify rather than threading the encoded string through the patch.
    assertEncodedSize(key, sanitized);
    upserts.set(key, sanitized);
  }
  return { upserts, deletes };
}

/**
 * Reason codes are part of the RPC error `data.reason` surface — admin
 * UIs and plugin tests match on these strings, so treat them as a
 * public contract.
 */
type MetaSanitizationReason =
  | "not_registered"
  | "post_type_mismatch"
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
  CONFLICT: (args: {
    data: { reason: string; key?: string };
  }) => Error;
}

/**
 * Thin wrapper around `sanitizeMetaInput` that translates a thrown
 * `MetaSanitizationError` into the RPC handler's CONFLICT envelope.
 * Keeps the per-handler call site to one line and localizes the
 * `meta_${reason}` naming convention here instead of copy-pasting it
 * into create.ts / update.ts.
 */
export function sanitizeMetaForRpc(
  registry: PluginRegistry,
  postType: string,
  input: PostMetaMap | undefined,
  errors: RpcErrorsForMeta,
): MetaPatch | null {
  try {
    return sanitizeMetaInput(registry, postType, input);
  } catch (error) {
    if (error instanceof MetaSanitizationError) {
      throw errors.CONFLICT({
        data: { reason: `meta_${error.reason}`, key: error.key },
      });
    }
    throw error;
  }
}

function coerceToType(definition: RegisteredMeta, value: unknown): unknown {
  switch (definition.type) {
    case "string":
      return coerceString(definition.key, value);
    case "number":
      return coerceNumber(definition.key, value);
    case "boolean":
      return coerceBoolean(definition.key, value);
    case "json":
      return coerceJson(definition.key, value);
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
  // Accept the common truthy/falsy forms from form-encoded and query-string
  // callers — 0/1 (numeric or stringified) and "true"/"false". Anything else
  // is rejected so `"yes"` / `"off"` don't silently become booleans of
  // surprising polarity.
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  throw new MetaSanitizationError(key, "invalid_value");
}

function coerceJson(key: string, value: unknown): unknown {
  // json keys take anything round-trippable through JSON.stringify — we
  // reject values that throw (BigInt) or silently drop (functions,
  // Symbols) so reads don't hand back `undefined` for something a plugin
  // thought it stored. TS types JSON.stringify as always-string, but at
  // runtime it returns `undefined` for un-serializable inputs — hence
  // the cast.
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
  // `TextEncoder.encode(...).length` is the canonical UTF-8 byte length;
  // avoids a `Buffer` dependency (which we don't have in workers anyway).
  const byteLength = new TextEncoder().encode(encoded).length;
  if (byteLength > MAX_META_VALUE_BYTES) {
    throw new MetaSanitizationError(key, "value_too_large");
  }
}

/**
 * Decode one row's stored value against its registered type. Unregistered
 * keys fall through as raw strings — the row exists in the DB but the
 * plugin that wrote it is no longer installed; we don't pretend to know
 * its shape.
 */
function decodeMetaValue(
  registry: PluginRegistry,
  key: string,
  raw: string,
): unknown {
  const definition = registry.metaKeys.get(key);
  if (!definition) {
    // Best-effort parse so plugin authors can still see the data during
    // migration; fall back to the raw string if it was stored before we
    // settled on JSON encoding.
    return tryParseJson(raw, raw);
  }
  const parsed = tryParseJson(raw, raw);
  return coerceOnRead(definition.type, parsed);
}

function tryParseJson(raw: string, fallback: unknown): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function coerceOnRead(type: MetaScalarType, value: unknown): unknown {
  // Reads are forgiving — the row was validated on write but a schema
  // change (e.g. a plugin flipping `number` → `string`) shouldn't 500 the
  // editor. We coerce when we can and fall through to the raw value
  // otherwise.
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

/**
 * Load the full meta bag for a single post. Returns an empty object when
 * the post has no meta rows. Used by `post.get` / `post.create` /
 * `post.update` to populate the output envelope.
 */
export async function loadPostMeta(
  context: AppContext,
  postId: number,
): Promise<PostMetaMap> {
  const rows = await context.db
    .select({ key: postMeta.key, value: postMeta.value })
    .from(postMeta)
    .where(eq(postMeta.postId, postId));
  const out: PostMetaMap = {};
  for (const row of rows) {
    out[row.key] = decodeMetaValue(context.plugins, row.key, row.value);
  }
  return out;
}

/**
 * True when the patch would result in any DB writes. Handlers use this to
 * skip the short-circuit that's optimized for "no post change, no term
 * change, no meta change" requests.
 */
export function isEmptyMetaPatch(patch: MetaPatch | null): boolean {
  return (
    patch === null || (patch.upserts.size === 0 && patch.deletes.length === 0)
  );
}

/**
 * Apply a validated patch to the meta store. Partial semantics: keys not
 * mentioned in the patch are untouched. Deletes run first so a caller
 * that clears and re-sets the same key in one request behaves
 * predictably. Follows `applyTermPatch`'s "no transaction" pattern —
 * SQLite's D1 binding doesn't expose nested transactions cleanly, and
 * the existing terms path already accepts the same tradeoff.
 */
export async function applyMetaPatch(
  context: AppContext,
  postId: number,
  patch: MetaPatch,
): Promise<void> {
  if (patch.deletes.length > 0) {
    await context.db
      .delete(postMeta)
      .where(
        and(eq(postMeta.postId, postId), inArray(postMeta.key, patch.deletes)),
      );
  }
  if (patch.upserts.size === 0) return;
  const rows = Array.from(patch.upserts, ([key, value]) => ({
    postId,
    key,
    value: JSON.stringify(value),
  }));
  // `excluded.value` is SQLite's idiomatic "use the incoming INSERT row's
  // value" in an ON CONFLICT clause — the upsert target is the unique
  // (postId, key) index.
  await context.db
    .insert(postMeta)
    .values(rows)
    .onConflictDoUpdate({
      target: [postMeta.postId, postMeta.key],
      set: { value: sql`excluded.value` },
    });
}

/**
 * Fire the extension surface around a meta write: `rpc:post.meta:write`
 * lets plugins mutate or short-circuit a patch before it hits the DB;
 * `post.meta:updated` (with the CPT-scoped variant) fires after the write
 * so auditors / cache-invalidators can react. Kept in one place so the
 * create + update handlers stay thin.
 */
export async function writePostMetaWithHooks(
  context: AppContext,
  post: { id: number; type: string },
  patch: MetaPatch,
): Promise<void> {
  const filtered = await context.hooks.applyFilter(
    "rpc:post.meta:write",
    patch,
    post,
  );
  if (isEmptyMetaPatch(filtered)) return;
  await applyMetaPatch(context, post.id, filtered);

  const changes: PostMetaChanges = {
    set: Object.fromEntries(filtered.upserts),
    removed: [...filtered.deletes],
  };
  await context.hooks.doAction("post:meta_changed", post, changes);
}

/**
 * Payload for `post.meta:updated` (and CPT-scoped variant). `set` is the
 * decoded key → value map of upserts; `removed` is the list of cleared
 * keys. Plugins that need the old values should subscribe to the write
 * filter and snapshot themselves — the action is strictly "what just
 * happened".
 */
export interface PostMetaChanges {
  readonly set: Readonly<Record<string, unknown>>;
  readonly removed: readonly string[];
}

/**
 * Run the `rpc:post.meta:read` filter on a freshly-loaded meta bag.
 * Plugins can decorate (add derived keys), redact (drop secrets), or
 * replace the bag entirely — it's the post-read equivalent of the write
 * filter.
 */
export async function applyPostMetaReadFilter(
  context: AppContext,
  post: { id: number; type: string },
  meta: PostMetaMap,
): Promise<PostMetaMap> {
  return context.hooks.applyFilter("rpc:post.meta:read", meta, post);
}

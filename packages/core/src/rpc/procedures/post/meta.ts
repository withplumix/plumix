import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";

import type { AppContext } from "../../../context/app.js";
import type {
  MetaScalarType,
  PluginRegistry,
  RegisteredMeta,
} from "../../../plugin/manifest.js";
import { eq } from "../../../db/index.js";
import { posts } from "../../../db/schema/posts.js";

// Post meta lives in a single JSON column (`posts.meta`). Writes merge
// into the existing bag via SQLite's `json_set` / `json_remove` so
// concurrent updaters touching disjoint keys don't clobber each other at
// the row level; reads come back already-parsed thanks to drizzle's
// `mode: "json"`.

/**
 * Hard cap on the JSON-encoded size of a single meta value, in bytes.
 * 256KiB fits any realistic plugin-shaped JSON config while bounding the
 * damage an adversarial writer can do. Enforced in `coerceToType` rather
 * than the valibot schema so plugin authors can calibrate per key via a
 * custom `sanitize` if they need tighter bounds.
 */
const MAX_META_VALUE_BYTES = 256 * 1024;

type PostMetaMap = Record<string, unknown>;

/**
 * Validated meta patch produced by `sanitizeMetaInput`. Values in
 * `upserts` are the *decoded* post-sanitization objects — the `MetaPatch`
 * is what filter hooks see, so keeping decoded values here means a
 * plugin doesn't have to double-parse. `applyMetaPatch` JSON-encodes at
 * the last moment, before the UPDATE.
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
  CONFLICT: (args: { data: { reason: string; key?: string } }) => Error;
}

/**
 * Thin wrapper around `sanitizeMetaInput` that translates a thrown
 * `MetaSanitizationError` into the RPC handler's CONFLICT envelope.
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
  const byteLength = new TextEncoder().encode(encoded).length;
  if (byteLength > MAX_META_VALUE_BYTES) {
    throw new MetaSanitizationError(key, "value_too_large");
  }
}

/**
 * Decode a raw meta bag (as returned by drizzle's JSON-mode column) into
 * the plugin-typed shape RPC consumers expect. Unregistered keys pass
 * through untouched — the row exists in the DB but the plugin that wrote
 * it is no longer installed; we don't pretend to know its shape.
 */
export function decodeMetaBag(
  registry: PluginRegistry,
  raw: Readonly<Record<string, unknown>> | null | undefined,
): PostMetaMap {
  if (!raw) return {};
  const out: PostMetaMap = {};
  for (const [key, value] of Object.entries(raw)) {
    const definition = registry.metaKeys.get(key);
    out[key] = definition ? coerceOnRead(definition.type, value) : value;
  }
  return out;
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
 * the post has no meta (fresh row) or has been deleted. Used by
 * `post.create` / `post.update` to read back the post-write state.
 */
export async function loadPostMeta(
  context: AppContext,
  postId: number,
): Promise<PostMetaMap> {
  const [row] = await context.db
    .select({ meta: posts.meta })
    .from(posts)
    .where(eq(posts.id, postId));
  return decodeMetaBag(context.plugins, row?.meta);
}

/**
 * True when the patch is a no-op (null, or zero upserts + zero deletes).
 * `post.update` uses this as part of the "nothing to write anywhere"
 * short-circuit — when this, `termsPatch`, and the column patch are all
 * empty, the handler skips the writes and returns the existing row.
 */
export function isEmptyMetaPatch(patch: MetaPatch | null): boolean {
  return (
    patch === null || (patch.upserts.size === 0 && patch.deletes.length === 0)
  );
}

/**
 * Merge a validated patch into `posts.meta` via `json_set` /
 * `json_remove`. Deletes nest inside sets so a caller that clears and
 * re-sets the same key in one request behaves predictably. Partial
 * semantics: keys not mentioned in the patch are untouched.
 */
export async function applyMetaPatch(
  context: AppContext,
  postId: number,
  patch: MetaPatch,
): Promise<void> {
  if (patch.upserts.size === 0 && patch.deletes.length === 0) return;

  let expr: SQL = sql`${posts.meta}`;
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

  await context.db
    .update(posts)
    .set({ meta: expr })
    .where(eq(posts.id, postId));
}

// SQLite's JSON path `$.label` only accepts `[A-Za-z0-9_]` in unquoted
// labels, but valid meta keys may include `-` or `:` (see the input
// schema regex). The double-quoted label form `$."foo-bar"` handles
// them; interpolation is safe because keys are pre-validated to exclude
// `"` and `\`.
function metaJsonPath(key: string): string {
  return `$."${key}"`;
}

/**
 * Apply a meta patch and fire `post:meta_changed` so auditors /
 * cache-invalidators can react. Plugins that need to mutate the patch
 * should subscribe to `rpc:post.{create,update}:input` instead —
 * mutating `input.meta` there feeds the sanitizer + writer downstream.
 */
export async function writePostMeta(
  context: AppContext,
  post: { id: number; type: string },
  patch: MetaPatch,
): Promise<void> {
  if (isEmptyMetaPatch(patch)) return;
  await applyMetaPatch(context, post.id, patch);

  const changes: PostMetaChanges = {
    set: Object.fromEntries(patch.upserts),
    removed: [...patch.deletes],
  };
  await context.hooks.doAction("post:meta_changed", post, changes);
}

/**
 * Payload for `post:meta_changed`. `set` is the decoded key → value map
 * of upserts; `removed` is the list of cleared keys.
 */
export interface PostMetaChanges {
  readonly set: Readonly<Record<string, unknown>>;
  readonly removed: readonly string[];
}

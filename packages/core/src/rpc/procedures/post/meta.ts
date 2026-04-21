import { sql } from "drizzle-orm";

import type { AppContext, Db } from "../../../context/app.js";
import type {
  MetaScalarType,
  PluginRegistry,
  RegisteredMeta,
} from "../../../plugin/manifest.js";
import { and, eq, inArray } from "../../../db/index.js";
import { postMeta } from "../../../db/schema/post_meta.js";

export type { PostWithMeta } from "../../../db/schema/posts.js";

// The unfortunate truth about post meta is that the store is a single TEXT
// column: we can only round-trip values via JSON. That's fine for what we
// support today (`string` / `number` / `boolean` / `json`) but we pay for
// it with an encode/decode pair and an allowlist of types the registry is
// willing to hydrate on read.

type PostMetaMap = Record<string, unknown>;

/**
 * Validation outcome for a meta patch before we touch the DB. We split
 * `upserts` (key → encoded JSON string) from `deletes` so the handler can
 * issue a single upsert statement and a single delete-by-keys statement.
 */
interface MetaPatch {
  readonly upserts: ReadonlyMap<string, string>;
  readonly deletes: readonly string[];
}

/**
 * Validate an incoming meta map against the plugin registry and produce a
 * DB-ready patch. Unregistered keys, keys registered for a different
 * post type, and type-coercion failures all throw so the caller can
 * surface them as 4xx before any write. `null` values are deletion
 * requests; everything else is coerced + encoded.
 */
export function sanitizeMetaInput(
  registry: PluginRegistry,
  postType: string,
  input: PostMetaMap | undefined,
): MetaPatch | null {
  if (input === undefined) return null;
  const upserts = new Map<string, string>();
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
    upserts.set(key, encodeMetaValue(sanitized));
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
  | "invalid_value";

export class MetaSanitizationError extends Error {
  readonly key: string;
  readonly reason: MetaSanitizationReason;
  constructor(key: string, reason: MetaSanitizationReason) {
    super(`meta key "${key}" failed sanitization: ${reason}`);
    this.key = key;
    this.reason = reason;
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
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  throw new MetaSanitizationError(key, "invalid_value");
}

function coerceBoolean(key: string, value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1) return true;
  if (value === "false" || value === 0) return false;
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

function encodeMetaValue(value: unknown): string {
  return JSON.stringify(value);
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
  db: Db,
  registry: PluginRegistry,
  postId: number,
): Promise<PostMetaMap> {
  const rows = await db
    .select({ key: postMeta.key, value: postMeta.value })
    .from(postMeta)
    .where(eq(postMeta.postId, postId));
  const out: PostMetaMap = {};
  for (const row of rows) {
    out[row.key] = decodeMetaValue(registry, row.key, row.value);
  }
  return out;
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
    value,
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

import type { JsonValue } from "../../json.js";
import type { DebugSnapshot } from "./snapshot.js";

/**
 * One captured request in the dev request-history: the finished request's
 * identity/outcome plus its {@link DebugSnapshot}. Everything here is inert
 * JSON — the store serializes the snapshot on {@link DebugHistoryStore.save},
 * so an entry never pins a live `ctx`, `Request`, DB connection, or closure.
 * `id` is the request id (the switcher selects and {@link DebugHistoryStore.find}
 * looks up by it); `startedAt`/`status`/`durationMs` label an entry without
 * reopening the snapshot.
 */
export interface DebugHistoryEntry {
  readonly id: string;
  /** When the request began (epoch ms) — the request envelope's `startedAt`. */
  readonly startedAt: number;
  readonly status: number;
  readonly durationMs: number;
  readonly snapshot: DebugSnapshot;
}

/**
 * A bounded, transport-agnostic store of the most recent requests, standalone
 * so later readers — the dev read route and a future MCP tool — reuse it
 * unchanged. The in-memory ring is dev-only and tree-shaken from production.
 */
export interface DebugHistoryStore {
  /**
   * Capture one finished request. The snapshot is deep-copied to inert JSON
   * and payload-bounded (oversized strings truncated) before storing, so the
   * store never retains a live reference and its footprint stays flat. Past
   * the entry-count or total-byte caps the oldest entries are evicted.
   */
  save(entry: DebugHistoryEntry): void;
  /** The stored entry with this request id, or undefined. */
  find(id: string): DebugHistoryEntry | undefined;
  /** Every stored entry, newest first. */
  get(): readonly DebugHistoryEntry[];
}

export interface DebugHistoryStoreOptions {
  /** Ring capacity; drop-oldest past it. */
  readonly maxEntries?: number;
  /** Total-byte budget across the ring; evict oldest past it (newest kept). */
  readonly maxTotalBytes?: number;
  /** Individual string cap; longer values are truncated at capture. */
  readonly maxStringLength?: number;
}

// Small fixed defaults: ~10 requests is enough to compare a short sequence,
// and the byte budget guards a pathological single request (a huge SQL dump)
// from pinning megabytes. Dev-only, so the numbers favour usefulness over
// frugality while staying flat.
const DEFAULT_MAX_ENTRIES = 10;
const DEFAULT_MAX_TOTAL_BYTES = 2_000_000;
const DEFAULT_MAX_STRING_LENGTH = 8_192;

export function createDebugHistoryStore(
  options: DebugHistoryStoreOptions = {},
): DebugHistoryStore {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const maxStringLength = options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH;

  // Oldest-first internally (push appends); `get` reverses to newest-first.
  // `bytes` is the entry's approximate serialized size, tracked so the byte
  // budget is an O(1) running total rather than a re-measure per save.
  const ring: { entry: DebugHistoryEntry; bytes: number }[] = [];
  let totalBytes = 0;

  function evictOldest(): void {
    const oldest = ring.shift();
    if (oldest) totalBytes -= oldest.bytes;
  }

  return {
    save(entry) {
      // Safety: `sanitize` rewrites leaves, never structure — it truncates
      // long strings and replaces what JSON can't carry, so every key the
      // snapshot declares survives with a value of its declared shape.
      const snapshot = sanitize(
        entry.snapshot,
        maxStringLength,
      ) as unknown as DebugSnapshot;
      const stored: DebugHistoryEntry = { ...entry, snapshot };
      const bytes = JSON.stringify(snapshot).length;
      ring.push({ entry: stored, bytes });
      totalBytes += bytes;

      // Hard count cap first, then the byte budget — but never evict the
      // just-captured entry, so a lone oversized request still shows up.
      while (ring.length > maxEntries) evictOldest();
      while (ring.length > 1 && totalBytes > maxTotalBytes) evictOldest();
    },
    find(id) {
      return ring.find((slot) => slot.entry.id === id)?.entry;
    },
    get() {
      return ring.map((slot) => slot.entry).reverse();
    },
  };
}

/**
 * The process-wide dev request-history. A module singleton because the ring
 * must outlive any one request — the worker isolate keeps it across requests,
 * the writer appends to it, a later read route reads it. Referenced only under
 * the `PLUMIX_DEV` gate, so it and this whole module are tree-shaken from
 * production builds.
 */
export const debugHistory: DebugHistoryStore = createDebugHistoryStore();

// Force-resolved to inert JSON: sentinel for a value JSON would drop
// (function, symbol, undefined). Callers skip the key / substitute null,
// mirroring `JSON.stringify`.
const DROP = Symbol("drop");

/**
 * Deep-copies a value to inert JSON: primitives pass, strings truncate past
 * `maxString`, functions/symbols/undefined drop, and a circular reference
 * becomes `"[Circular]"` instead of throwing. Records carry `unknown` data a
 * plugin may fill with live objects, so this is the leak boundary — nothing
 * live (an `Error`, a DB handle, a closure) survives into the store.
 */
function sanitize(value: unknown, maxString: number): JsonValue {
  const result = sanitizeInner(value, maxString, new WeakSet());
  // Top level is always a snapshot object, never a dropped primitive.
  return result === DROP ? null : result;
}

function sanitizeInner(
  value: unknown,
  maxString: number,
  seen: WeakSet<object>,
): JsonValue | typeof DROP {
  if (value === null) return null;
  const type = typeof value;
  if (type === "string") return truncate(value as string, maxString);
  if (type === "number")
    return Number.isFinite(value) ? (value as number) : null;
  if (type === "boolean") return value as boolean;
  if (type === "bigint") return truncate(`${value as bigint}`, maxString);
  if (type !== "object") return DROP;

  const object = value as object;
  // Honour `toJSON` (a Date, a Temporal, a custom serializer) exactly as
  // `JSON.stringify` would, so a recorded timestamp becomes its ISO string
  // rather than the `{}` a bare `Object.entries` walk would yield.
  if ("toJSON" in object && typeof object.toJSON === "function") {
    return sanitizeInner((object.toJSON as () => unknown)(), maxString, seen);
  }
  // Ancestor-only cycle guard: deleted on the way out so a value referenced
  // twice across siblings still serializes both times.
  if (seen.has(object)) return "[Circular]";
  seen.add(object);
  try {
    if (Array.isArray(object)) {
      return object.map((item) => {
        const sanitized = sanitizeInner(item, maxString, seen);
        return sanitized === DROP ? null : sanitized;
      });
    }
    const out: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(object)) {
      const sanitized = sanitizeInner(item, maxString, seen);
      if (sanitized !== DROP) out[key] = sanitized;
    }
    return out;
  } finally {
    seen.delete(object);
  }
}

function truncate(text: string, maxString: number): string {
  if (text.length <= maxString) return text;
  const dropped = text.length - maxString;
  return `${text.slice(0, maxString)}… [${dropped} chars truncated]`;
}

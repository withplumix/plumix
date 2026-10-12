import type {
  DebugHistoryEntry,
  DebugHistoryStore,
  DebugHistoryStoreOptions,
  DebugSnapshot,
} from "../../context/dev-runtime.js";
import type { JsonValue } from "../../json.js";

export type {
  DebugHistoryEntry,
  DebugHistoryStore,
} from "../../context/dev-runtime.js";

/**
 * Dev-only defaults: ~10 requests to compare a short sequence, and a byte
 * budget so one pathological request (a huge SQL dump) can't pin megabytes.
 */
const DEFAULT_MAX_ENTRIES = 10;
const DEFAULT_MAX_TOTAL_BYTES = 2_000_000;
const DEFAULT_MAX_STRING_LENGTH = 8_192;

export function createDebugHistoryStore(
  options: DebugHistoryStoreOptions = {},
): DebugHistoryStore {
  const ring = createBoundedRing<DebugHistoryEntry>(options);
  return {
    save(entry) {
      // Only the snapshot is sanitized; the envelope fields are already JSON.
      ring.push(entry, (item, maxString) => {
        // Safety: `sanitize` rewrites leaves, never structure — it truncates
        // long strings and replaces what JSON can't carry, so every key the
        // snapshot declares survives with a value of its declared shape.
        const snapshot = sanitize(
          item.snapshot,
          maxString,
        ) as unknown as DebugSnapshot;
        return { stored: { ...item, snapshot }, measured: snapshot };
      });
    },
    find(id) {
      return ring.items().find((entry) => entry.id === id);
    },
    get() {
      return [...ring.items()].reverse();
    },
  };
}

/** What a ring keeps of one pushed item, and the part its byte budget counts. */
interface Sanitized<T> {
  readonly stored: T;
  readonly measured: unknown;
}

interface BoundedRing<T> {
  push(
    item: T,
    sanitizeItem: (item: T, maxString: number) => Sanitized<T>,
  ): void;
  /** Oldest first. */
  items(): readonly T[];
  clear(): void;
}

/**
 * The caps `config.dev.history` sets, shared by every dev store that keeps
 * request data, so one setting bounds them all.
 */
export function createBoundedRing<T>(
  options: DebugHistoryStoreOptions = {},
): BoundedRing<T> {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const maxStringLength = options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH;

  // Oldest-first. `bytes` keeps the budget an O(1) running total rather than
  // a re-measure per push.
  let ring: { item: T; bytes: number }[] = [];
  let totalBytes = 0;

  function evictOldest(): void {
    const oldest = ring.shift();
    if (oldest) totalBytes -= oldest.bytes;
  }

  return {
    push(item, sanitizeItem) {
      const { stored, measured } = sanitizeItem(item, maxStringLength);
      const bytes = JSON.stringify(measured).length;
      ring.push({ item: stored, bytes });
      totalBytes += bytes;

      // Hard count cap first, then the byte budget — but never evict the
      // just-pushed item, so a lone oversized one still shows up.
      while (ring.length > maxEntries) evictOldest();
      while (ring.length > 1 && totalBytes > maxTotalBytes) evictOldest();
    },
    items() {
      return ring.map((slot) => slot.item);
    },
    clear() {
      ring = [];
      totalBytes = 0;
    },
  };
}

/**
 * Force-resolved to inert JSON: sentinel for a value JSON would drop
 * (function, symbol, undefined). Callers skip the key / substitute null,
 * mirroring `JSON.stringify`.
 */
const DROP = Symbol("drop");

/**
 * A record's `data` is typed `JsonValue` but nothing checks it at runtime, so
 * this is the boundary that keeps live values (errors, DB handles) out.
 */
export function sanitize(value: unknown, maxString: number): JsonValue {
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
    // The annotation is what `toJSON` exists to promise, not something proved
    // here — the result goes straight back through this walk, which decides
    // the shape either way.
    return sanitizeInner((object.toJSON as () => JsonValue)(), maxString, seen);
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

import type {
  TelemetryCollector,
  TelemetryRecord,
  TelemetrySpan,
  TelemetrySpanHandle,
} from "../context/telemetry.js";
import type { DebugBarInput } from "./config.js";
import { traceStore } from "../context/stores.js";
import { NOOP_HANDLE, NOOP_TELEMETRY } from "../context/telemetry.js";
import { normalizeDebugBar } from "./config.js";

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value != null && typeof (value as PromiseLike<unknown>).then === "function"
  );
}

// `String(x)` itself throws for e.g. `Object.create(null)`; the serializer
// must never replace the original failure with its own.
function describeThrown(error: unknown): { name: string; message: string } {
  try {
    return { name: "Error", message: String(error) };
  } catch {
    return { name: "Error", message: "<unserializable thrown value>" };
  }
}

// Hard per-request caps so a pathological path (a runaway loop, an extreme
// N+1) can't accumulate unbounded memory. Overflow is never silent: it counts
// into getDropped(). Fixed on purpose — no config knob.
const MAX_SPANS = 2000;
const MAX_RECORDS_PER_NAMESPACE = 1000;

/**
 * The real, dev-only telemetry collector. Accumulates per-namespace entries and
 * a span tree for the request. Created only under the dev gate; production uses
 * {@link NOOP_TELEMETRY} instead, so this module tree-shakes out of prod builds.
 */
export function createTelemetryCollector(
  debugBar: DebugBarInput | undefined,
): TelemetryCollector {
  const { enabled, disabled } = normalizeDebugBar(debugBar);
  // Globally disabled in dev: skip all collection overhead, not just render.
  if (!enabled) return NOOP_TELEMETRY;

  const entries = new Map<string, TelemetryRecord[]>();
  const roots: TelemetrySpan[] = [];
  let spanCount = 0;
  let droppedSpans = 0;
  const droppedRecords: Record<string, number> = {};

  return {
    record(namespace, entry) {
      // A disabled panel stops collecting too (not just rendering): its
      // namespace is its panel id, so denylisted namespaces drop at the source
      // — before a lazy entry is ever evaluated.
      if (disabled.has(namespace)) return;
      const bucket = entries.get(namespace);
      if (bucket && bucket.length >= MAX_RECORDS_PER_NAMESPACE) {
        droppedRecords[namespace] = (droppedRecords[namespace] ?? 0) + 1;
        return;
      }
      const record: TelemetryRecord = {
        at: Date.now(),
        data: typeof entry === "function" ? (entry as () => unknown)() : entry,
      };
      if (bucket) bucket.push(record);
      else entries.set(namespace, [record]);
    },
    span(name, fn) {
      // Same source-drop rule as record(): a span named after a denylisted
      // panel id is not collected and its lazy attributes never evaluate.
      if (disabled.has(name)) return fn(NOOP_HANDLE);
      // Over the cap: the work still runs and returns unchanged, but no span
      // is allocated and lazy attributes are never evaluated.
      if (spanCount >= MAX_SPANS) {
        droppedSpans += 1;
        return fn(NOOP_HANDLE);
      }
      spanCount += 1;
      const startedAt = Date.now();
      const span: TelemetrySpan = {
        name,
        startedAt,
        durationMs: 0,
        status: "ok",
        attributes: {},
        children: [],
      };
      const handle: TelemetrySpanHandle = {
        set(key, value) {
          span.attributes[key] = typeof value === "function" ? value() : value;
        },
      };
      // Attach to the enclosing span (via AsyncLocalStorage) so nesting
      // reflects call structure; top-level spans become roots.
      const parent = traceStore.getStore();
      if (parent) parent.children.push(span);
      else roots.push(span);
      const stamp = (): void => {
        span.durationMs = Date.now() - startedAt;
      };
      // Serialized (never the live Error) so a finished span tree stays
      // JSON-safe for any consumer; the failure itself propagates unchanged.
      const fail = (error: unknown): void => {
        stamp();
        span.status = "error";
        span.error =
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : describeThrown(error);
      };
      let result: ReturnType<typeof fn>;
      try {
        result = traceStore.run(span, () => fn(handle));
      } catch (error) {
        fail(error);
        throw error;
      }
      // Await async work before stamping so I/O time is measured, not just the
      // synchronous prelude. Nesting already survives awaits via ALS.
      if (isThenable(result)) {
        return result.then(
          (value) => {
            stamp();
            return value;
          },
          (error: unknown) => {
            fail(error);
            throw error;
          },
        ) as ReturnType<typeof fn>;
      }
      stamp();
      return result;
    },
    get(namespace) {
      return entries.get(namespace) ?? [];
    },
    getSpans() {
      return roots;
    },
    getDropped() {
      // Snapshot, not the live counter map — a captured value must not mutate.
      return { spans: droppedSpans, records: { ...droppedRecords } };
    },
  };
}

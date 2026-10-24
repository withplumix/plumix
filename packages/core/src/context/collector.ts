import type { JsonValue } from "../json.js";
import type { LogMeta } from "./app-context.js";
import type {
  TelemetryCollector,
  TelemetryRecord,
  TelemetrySpan,
  TelemetrySpanError,
  TelemetrySpanHandle,
} from "./telemetry.js";
import { traceStore } from "./stores.js";
import { NOOP_HANDLE } from "./telemetry.js";

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value != null && typeof (value as PromiseLike<unknown>).then === "function"
  );
}

/**
 * `String(x)` itself throws for e.g. `Object.create(null)`; the serializer
 * must never replace the original failure with its own.
 */
function describeThrown(error: unknown): { name: string; message: string } {
  try {
    return { name: "Error", message: String(error) };
  } catch {
    return { name: "Error", message: "<unserializable thrown value>" };
  }
}

function serializeError(error: Error): TelemetrySpanError {
  return { name: error.name, message: error.message, stack: error.stack };
}

function toAttributes(meta: LogMeta | undefined): Record<string, JsonValue> {
  try {
    return JSON.parse(
      JSON.stringify(meta ?? {}, (_key, value: unknown) =>
        value instanceof Error ? serializeError(value) : value,
      ),
    ) as Record<string, JsonValue>;
  } catch (cause) {
    // A log call must never throw, so meta JSON cannot hold is dropped, and
    // says why.
    return { unserializable: describeThrown(cause).message };
  }
}

/**
 * Bounds memory on a runaway loop or extreme N+1; overflow counts into
 * getDropped(), never silently.
 */
const MAX_SPANS = 2000;
const MAX_RECORDS_PER_NAMESPACE = 1000;
const MAX_LOGS = 1000;

export function createTelemetryCollector(): TelemetryCollector {
  const entries = new Map<string, TelemetryRecord[]>();
  const roots: TelemetrySpan[] = [];
  let spanCount = 0;
  let droppedSpans = 0;
  let logCount = 0;
  let droppedLogs = 0;
  const droppedRecords: Record<string, number> = {};

  return {
    record(namespace, entry) {
      const bucket = entries.get(namespace);
      if (bucket && bucket.length >= MAX_RECORDS_PER_NAMESPACE) {
        droppedRecords[namespace] = (droppedRecords[namespace] ?? 0) + 1;
        return;
      }
      const record: TelemetryRecord = {
        at: Date.now(),
        data: typeof entry === "function" ? entry() : entry,
      };
      if (bucket) bucket.push(record);
      else entries.set(namespace, [record]);
    },
    log(level, message, meta) {
      const span = traceStore.getStore();
      if (!span) return;
      if (logCount >= MAX_LOGS) {
        droppedLogs += 1;
        return;
      }
      logCount += 1;
      span.logs.push({
        at: Date.now(),
        level,
        message,
        attributes: toAttributes(meta),
      });
    },
    span(name, fn) {
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
        logs: [],
        children: [],
      };
      const handle: TelemetrySpanHandle = {
        set(key, value) {
          span.attributes[key] = typeof value === "function" ? value() : value;
        },
        cancel(message) {
          span.status = "cancelled";
          span.message = message;
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
            ? serializeError(error)
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
    getRecords() {
      // Copies, not the live buckets — this is the snapshot read, and a
      // captured snapshot must not grow under post-response recording.
      return Object.fromEntries(
        [...entries].map(([namespace, bucket]) => [namespace, [...bucket]]),
      );
    },
    getSpans() {
      return roots;
    },
    getDropped() {
      // Snapshot, not the live counter map — a captured value must not mutate.
      return {
        spans: droppedSpans,
        records: { ...droppedRecords },
        logs: droppedLogs,
      };
    },
  };
}

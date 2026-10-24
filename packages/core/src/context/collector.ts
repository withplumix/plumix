import type { JsonValue } from "../json.js";
import type { DeferFn, LogMeta } from "./app-context.js";
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

/** What delivering a sampled request's snapshot reads beyond its collector. */
export interface TelemetryDelivery {
  /**
   * Settles once every piece of the request's deferred work has, work that
   * work deferred in turn included.
   */
  settled(): Promise<void>;
  /**
   * A copy of the span tree as of `at`, which later work cannot change. A span
   * still open is `unfinished`, timed up to `at`.
   */
  spansAt(at: number): TelemetrySpan[];
  /**
   * The runtime's own `defer`, undefined when it gave none: what it is handed
   * opens no span and is not deferred work the snapshot waits for.
   */
  readonly defer: DeferFn | undefined;
  /**
   * Fires when a shutdown needs every waiting snapshot delivered now. A
   * snapshot it holds is not handed to `defer` while it waits.
   */
  readonly shutdown: AbortSignal | undefined;
}

/** What core reads of a request's collector beyond the public one. */
export interface RequestTelemetryCollector extends TelemetryCollector {
  /**
   * Times `work` as a `defer` span under the current span, adopting the open
   * spans it opened in the synchronous run that made this call.
   */
  deferred(
    work: Promise<unknown>,
    onRejected: (error: unknown) => void,
  ): Promise<void>;
  /** Settles once every `deferred` work has, work deferred in turn included. */
  settled(): Promise<void>;
  /**
   * A copy of the span tree as of `at`, which later work cannot change. A span
   * still open is `unfinished`, timed up to `at`.
   */
  spansAt(at: number): TelemetrySpan[];
}

function freeze(
  span: TelemetrySpan,
  at: number,
  open: ReadonlySet<TelemetrySpan>,
): TelemetrySpan {
  const copy: TelemetrySpan = {
    ...span,
    attributes: { ...span.attributes },
    logs: [...span.logs],
    children: span.children.map((child) => freeze(child, at, open)),
  };
  if (open.has(span)) {
    copy.status = "unfinished";
    copy.durationMs = at - span.startedAt;
  }
  return copy;
}

export function createTelemetryCollector(): RequestTelemetryCollector {
  const entries = new Map<string, TelemetryRecord[]>();
  const roots: TelemetrySpan[] = [];
  let spanCount = 0;
  let droppedSpans = 0;
  let logCount = 0;
  let droppedLogs = 0;
  const droppedRecords: Record<string, number> = {};
  const open = new Set<TelemetrySpan>();
  const pendingWork = new Set<Promise<void>>();
  // A synchronous run ends at the next microtask. Each span keeps the run it
  // opened in, so `deferred` tells what its argument opened from older spans.
  let run: object | undefined;
  const openedIn = new WeakMap<TelemetrySpan, object>();
  const currentRun = (): object => {
    if (run === undefined) {
      const fresh = {};
      run = fresh;
      queueMicrotask(() => {
        run = undefined;
      });
      return fresh;
    }
    return run;
  };

  // `undefined` over the cap.
  const openSpan = (name: string): TelemetrySpan | undefined => {
    if (spanCount >= MAX_SPANS) {
      droppedSpans += 1;
      return undefined;
    }
    spanCount += 1;
    const span: TelemetrySpan = {
      name,
      startedAt: Date.now(),
      durationMs: 0,
      status: "ok",
      attributes: {},
      logs: [],
      children: [],
    };
    // Attach to the enclosing span (via AsyncLocalStorage) so nesting
    // reflects call structure; top-level spans become roots.
    siblingsOf(traceStore.getStore()).push(span);
    open.add(span);
    openedIn.set(span, currentRun());
    return span;
  };
  const siblingsOf = (parent: TelemetrySpan | undefined): TelemetrySpan[] =>
    parent ? parent.children : roots;
  const stamp = (span: TelemetrySpan): void => {
    span.durationMs = Date.now() - span.startedAt;
    open.delete(span);
  };
  // Serialized (never the live Error) so a finished span tree stays JSON-safe
  // for any consumer; the failure itself propagates unchanged.
  const fail = (span: TelemetrySpan, error: unknown): void => {
    stamp(span);
    span.status = "error";
    span.error =
      error instanceof Error ? serializeError(error) : describeThrown(error);
  };

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
      const span = openSpan(name);
      if (span === undefined) return fn(NOOP_HANDLE);
      const handle: TelemetrySpanHandle = {
        set(key, value) {
          span.attributes[key] = typeof value === "function" ? value() : value;
        },
        cancel(message) {
          span.status = "cancelled";
          span.message = message;
        },
      };
      let result: ReturnType<typeof fn>;
      try {
        result = traceStore.run(span, () => fn(handle));
      } catch (error) {
        fail(span, error);
        throw error;
      }
      // Await async work before stamping so I/O time is measured, not just the
      // synchronous prelude. Nesting already survives awaits via ALS.
      if (isThenable(result)) {
        return result.then(
          (value) => {
            stamp(span);
            return value;
          },
          (error: unknown) => {
            fail(span, error);
            throw error;
          },
        ) as ReturnType<typeof fn>;
      }
      stamp(span);
      return result;
    },
    deferred(work, onRejected) {
      const parent = traceStore.getStore();
      const siblings = siblingsOf(parent);
      // `ctx.defer(f())` runs `f`'s synchronous prelude before the call, under
      // the caller's span; what it opened there is the deferred work's.
      const thisRun = run;
      const adopted = siblings.filter(
        (s) =>
          thisRun !== undefined && open.has(s) && openedIn.get(s) === thisRun,
      );
      const span = openSpan("defer");
      if (span !== undefined) {
        for (const child of adopted) {
          siblings.splice(siblings.indexOf(child), 1);
          span.children.push(child);
        }
        // Not adoptable by a later call in the same run.
        openedIn.delete(span);
      }
      const settle = (): Promise<void> =>
        work.then(
          () => {
            if (span) stamp(span);
          },
          (error: unknown) => {
            onRejected(error);
            if (span) fail(span, error);
          },
        );
      const tracked = span ? traceStore.run(span, settle) : settle();
      pendingWork.add(tracked);
      void tracked.then(() => pendingWork.delete(tracked));
      return tracked;
    },
    async settled() {
      while (pendingWork.size > 0) {
        await Promise.allSettled([...pendingWork]);
      }
    },
    spansAt(at) {
      return roots.map((root) => freeze(root, at, open));
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

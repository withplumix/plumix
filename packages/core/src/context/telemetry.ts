import type { JsonValue } from "../json.js";
import type {
  TelemetryConsumerFor,
  TelemetryDropped,
  TelemetryRecord,
  TelemetrySpan,
} from "../telemetry-snapshot.js";
import type { AppContext } from "./app-context.js";

// The collected data's shapes live below the context, so an exporter can name
// them without reaching it.
export type {
  TelemetryDropped,
  TelemetryRecord,
  TelemetryRequestEnvelope,
  TelemetrySnapshot,
  TelemetrySpan,
  TelemetrySpanError,
} from "../telemetry-snapshot.js";

/**
 * Handed to a span's function for attaching attributes. A lazy (thunk) value is
 * evaluated once by the active collector and never by the no-op — expensive
 * payloads cost nothing when nobody collects.
 */
export interface TelemetrySpanHandle {
  set(key: string, value: JsonValue | (() => JsonValue)): void;
}

/**
 * Request-scoped telemetry collector — the single source of truth for what
 * happened during a request. Core and plugins record spans (anything with a
 * duration) and records (durationless facts) under a namespace; consumers such
 * as the dev debug bar read them back. Two implementations:
 * {@link NOOP_TELEMETRY} (used whenever no consumer sampled the request) and
 * the real accumulating collector, activated by consumer vote.
 */
export interface TelemetryCollector {
  /**
   * Append an entry under `namespace` (for the debug bar: the panel's id).
   * A function entry is a lazy payload: the active collector evaluates it once
   * at record time; the no-op never does.
   */
  record(namespace: string, entry: JsonValue | (() => JsonValue)): void;
  /** Time `fn`, record a span, and return `fn`'s result unchanged. */
  span<T>(name: string, fn: (s: TelemetrySpanHandle) => T): T;
  /** Timestamped entries recorded under `namespace`, in record order. */
  get(namespace: string): readonly TelemetryRecord[];
  /** Every namespace's entries, keyed by namespace — the snapshot read. */
  getRecords(): Readonly<Record<string, readonly TelemetryRecord[]>>;
  /** The collected span tree (the Timeline panel consumes this). */
  getSpans(): readonly TelemetrySpan[];
  /** Counts of entries discarded by the per-request caps. */
  getDropped(): TelemetryDropped;
}

/** A telemetry consumer, handed the request's `AppContext`. */
export type TelemetryConsumer = TelemetryConsumerFor<AppContext>;

/** The `telemetry` app-config slot. */
export interface TelemetryConfig {
  readonly consumers?: readonly TelemetryConsumer[];
}

/** Shared no-op span handle: attributes (lazy or not) are never evaluated. */
export const NOOP_HANDLE: TelemetrySpanHandle = {
  set: () => undefined,
};

/**
 * The permanent no-op collector. Lives in core proper so plugin `ctx.telemetry`
 * call sites stay safe everywhere: `record` drops the entry, `span` calls
 * through and returns the result, reads are empty. The real collector is
 * swapped in only when at least one registered consumer votes to sample the
 * request — a site with no consumers pays nothing, in dev or prod.
 */
export const NOOP_TELEMETRY: TelemetryCollector = {
  record: () => undefined,
  span: (_name, fn) => fn(NOOP_HANDLE),
  get: () => [],
  getRecords: () => ({}),
  getSpans: () => [],
  getDropped: () => ({ spans: 0, records: {} }),
};

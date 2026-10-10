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
 * A thunk value is evaluated once by the active collector and never by the
 * no-op.
 */
export interface TelemetrySpanHandle {
  set(key: string, value: JsonValue | (() => JsonValue)): void;
}

export interface TelemetryCollector {
  /**
   * For the debug bar, `namespace` is the panel's id. A function entry is
   * evaluated once by the active collector and never by the no-op.
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
 * Used whenever no consumer samples the request: `span` still calls through,
 * everything else drops.
 */
export const NOOP_TELEMETRY: TelemetryCollector = {
  record: () => undefined,
  span: (_name, fn) => fn(NOOP_HANDLE),
  get: () => [],
  getRecords: () => ({}),
  getSpans: () => [],
  getDropped: () => ({ spans: 0, records: {} }),
};

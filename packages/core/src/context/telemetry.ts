/** Attribute and record values must be JSON-serializable — enforced by type only. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/**
 * A span's captured failure — the serialized form, never the live Error.
 * @public consumer-facing (imported by exporters, not core)
 */
export interface TelemetrySpanError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
}

/**
 * One node in the request's span tree. Minimal and OTel-mappable: an exporter
 * can project name/timing/attributes onto an OTel span ~1:1, minting ids at
 * export time.
 */
export interface TelemetrySpan {
  readonly name: string;
  readonly startedAt: number;
  /** Wall-clock duration; set when the span's work completes. */
  durationMs: number;
  /** "error" when the span's function threw or rejected; the error is captured
   * before the failure propagates unchanged. */
  status: "ok" | "error";
  error?: TelemetrySpanError;
  readonly attributes: Record<string, JsonValue>;
  readonly children: TelemetrySpan[];
}

/**
 * Handed to a span's function for attaching attributes. A lazy (thunk) value is
 * evaluated once by the active collector and never by the no-op — expensive
 * payloads cost nothing when nobody collects.
 */
export interface TelemetrySpanHandle {
  set(key: string, value: JsonValue | (() => JsonValue)): void;
}

/** A recorded durationless fact, stamped so consumers can order it against spans. */
export interface TelemetryRecord {
  readonly at: number;
  readonly data: unknown;
}

/**
 * What the hard per-request caps discarded — visible so a consumer never
 * mistakes a truncated trace for a complete one.
 * @public consumer-facing (imported by exporters, not core)
 */
export interface TelemetryDropped {
  readonly spans: number;
  readonly records: Readonly<Record<string, number>>;
}

/**
 * Request-scoped telemetry collector — the single source of truth for what
 * happened during a request. Core and plugins record spans (anything with a
 * duration) and records (durationless facts) under a namespace; consumers such
 * as the dev debug bar read them back. Two implementations:
 * {@link NOOP_TELEMETRY} (always present in core, prod-safe) and the real
 * accumulating collector in the dev-gated debug-bar module.
 */
export interface TelemetryCollector {
  /**
   * Append an entry under `namespace` (for the debug bar: the panel's id).
   * A function entry is a lazy payload: the active collector evaluates it once
   * at record time; the no-op (and a denylisted namespace) never does.
   */
  record(namespace: string, entry: unknown): void;
  /** Time `fn`, record a span, and return `fn`'s result unchanged. */
  span<T>(name: string, fn: (s: TelemetrySpanHandle) => T): T;
  /** Timestamped entries recorded under `namespace`, in record order. */
  get(namespace: string): readonly TelemetryRecord[];
  /** The collected span tree (the Timeline panel consumes this). */
  getSpans(): readonly TelemetrySpan[];
  /** Counts of entries discarded by the per-request caps. */
  getDropped(): TelemetryDropped;
}

/** Shared no-op span handle: attributes (lazy or not) are never evaluated. */
export const NOOP_HANDLE: TelemetrySpanHandle = {
  set: () => undefined,
};

/**
 * The permanent no-op collector. Lives in core proper so plugin `ctx.telemetry`
 * call sites stay safe in production: `record` drops the entry, `span` calls
 * through and returns the result, reads are empty. The real collector is
 * swapped in only under the dev gate.
 */
export const NOOP_TELEMETRY: TelemetryCollector = {
  record: () => undefined,
  span: (_name, fn) => fn(NOOP_HANDLE),
  get: () => [],
  getSpans: () => [],
  getDropped: () => ({ spans: 0, records: {} }),
};

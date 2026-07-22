import type { AppContext } from "./app.js";

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
 * {@link NOOP_TELEMETRY} (used whenever no consumer sampled the request) and
 * the real accumulating collector, activated by consumer vote.
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
  /** Every namespace's entries, keyed by namespace — the snapshot read. */
  getRecords(): Readonly<Record<string, readonly TelemetryRecord[]>>;
  /** The collected span tree (the Timeline panel consumes this). */
  getSpans(): readonly TelemetrySpan[];
  /** Counts of entries discarded by the per-request caps. */
  getDropped(): TelemetryDropped;
}

/**
 * The finished request's identity and outcome, as a consumer sees it.
 * `startedAt`/`durationMs` span the dispatch of the request — context
 * creation and the sampling vote happen just before the clock starts.
 * @public consumer-facing (imported by exporters, not core)
 */
export interface TelemetryRequestEnvelope {
  readonly requestId: string;
  readonly method: string;
  readonly url: string;
  readonly status: number;
  readonly startedAt: number;
  readonly durationMs: number;
}

/**
 * The finished, JSON-serializable view of a collected request: envelope, root
 * spans, timestamped records by namespace, and what the caps discarded.
 * Serializability is enforced by type only — no runtime validation. The
 * envelope `url` is the full request URL, query string included — an
 * exporter shipping snapshots off-box owns scrubbing query-borne secrets.
 * @public consumer-facing (imported by exporters, not core)
 */
export interface TelemetrySnapshot {
  readonly request: TelemetryRequestEnvelope;
  readonly spans: readonly TelemetrySpan[];
  readonly records: Readonly<Record<string, readonly TelemetryRecord[]>>;
  readonly dropped: TelemetryDropped;
}

/**
 * A telemetry export destination, registered once in app config
 * (`telemetry.consumers`). A request collects iff at least one registered
 * consumer votes yes; with no consumers the collector stays the no-op and
 * production pays nothing.
 */
export interface TelemetryConsumer {
  readonly id: string;
  /**
   * Head-sampling vote, called once at context creation (before any
   * collection — `ctx.telemetry` is not yet active). Omitted = always yes.
   * Runs pre-auth: on public requests `ctx.user` is null even when a
   * session cookie is present. A throwing vote fails the request — decide
   * from cheap request-shaped facts and don't throw.
   */
  readonly sample?: (ctx: AppContext) => boolean;
  /**
   * Receives the finished snapshot after the response (via `waitUntil` on
   * Workers), so export latency never adds to response time. Errors live in
   * the span tree — there is no separate error callback; an error-hook
   * consumer may read the live `ctx.telemetry` mid-request instead.
   */
  readonly onRequestEnd?: (
    snapshot: TelemetrySnapshot,
    ctx: AppContext,
  ) => void | Promise<void>;
}

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

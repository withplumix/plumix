import type { JsonValue } from "./json.js";

// What a request's telemetry collects, as the finished snapshot a consumer is
// handed. Below the context so an exporter (`telemetry-otel`) names the data
// without the context; `context/telemetry.ts` adds the collector over it.

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

/** A recorded durationless fact, stamped so consumers can order it against spans. */
export interface TelemetryRecord {
  readonly at: number;
  readonly data: JsonValue;
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
 * The finished request's identity and outcome, as a consumer sees it.
 * `requestId` is `ctx.requestId`, minted at context creation — mid-request
 * reads (logs, error hooks) correlate with the snapshot on the same value.
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
 *
 * Generic over the context it is handed: `TelemetryConsumer` is this with the
 * request's `AppContext`, and an exporter that reads less asks for less.
 */
export interface TelemetryConsumerFor<TCtx> {
  readonly id: string;
  /**
   * Head-sampling vote, called once at context creation (before any
   * collection — `ctx.telemetry` is not yet active). Omitted = always yes.
   * Runs pre-auth: on public requests `ctx.user` is null even when a
   * session cookie is present. A throwing vote fails the request — decide
   * from cheap request-shaped facts and don't throw.
   */
  readonly sample?: (ctx: TCtx) => boolean;
  /**
   * Receives the finished snapshot after the response (via `waitUntil` on
   * Workers), so export latency never adds to response time. Errors live in
   * the span tree — there is no separate error callback; an error-hook
   * consumer may read the live `ctx.telemetry` mid-request instead.
   */
  readonly onRequestEnd?: (
    snapshot: TelemetrySnapshot,
    ctx: TCtx,
  ) => void | Promise<void>;
}

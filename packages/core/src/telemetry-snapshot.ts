import type { JsonValue } from "./json.js";

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
 * A recorded durationless fact, stamped so consumers can order it against
 * spans.
 */
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
 * `requestId` is `ctx.requestId`, so mid-request logs correlate. The clock
 * starts after context creation and the sampling vote.
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
 * Serializability is enforced by type only. `url` keeps its query string, so
 * an exporter shipping snapshots off-box owns scrubbing secrets.
 * @public consumer-facing (imported by exporters, not core)
 */
export interface TelemetrySnapshot {
  readonly request: TelemetryRequestEnvelope;
  readonly spans: readonly TelemetrySpan[];
  readonly records: Readonly<Record<string, readonly TelemetryRecord[]>>;
  readonly dropped: TelemetryDropped;
}

/**
 * A request collects only if a consumer votes yes. Generic over the context,
 * so an exporter that reads less asks for less.
 */
export interface TelemetryConsumerFor<TCtx> {
  readonly id: string;
  /**
   * Runs pre-auth and before collection, so `ctx.user` is null on public
   * requests. A throwing vote fails the request. Omitted means yes.
   */
  readonly sample?: (ctx: TCtx) => boolean;
  /**
   * Runs after the response. Errors live in the span tree; there is no
   * separate error callback.
   */
  readonly onRequestEnd?: (
    snapshot: TelemetrySnapshot,
    ctx: TCtx,
  ) => void | Promise<void>;
}

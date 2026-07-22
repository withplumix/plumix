import type {
  JsonValue,
  TelemetryConsumer,
  TelemetrySnapshot,
  TelemetrySpan,
} from "./context/telemetry.js";

/** OTLP/JSON `AnyValue` — the primitive subset the exporter emits. */
interface OtlpValue {
  stringValue?: string;
  boolValue?: boolean;
  intValue?: string;
  doubleValue?: number;
  arrayValue?: { values: OtlpValue[] };
}

interface OtlpKeyValue {
  key: string;
  value: OtlpValue;
}

interface OtlpEvent {
  timeUnixNano: string;
  name: string;
  attributes: OtlpKeyValue[];
}

interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpKeyValue[];
  events?: OtlpEvent[];
  droppedEventsCount?: number;
  status: { code?: number; message?: string };
}

const SPAN_KIND_INTERNAL = 1;
const SPAN_KIND_SERVER = 2;
const STATUS_CODE_ERROR = 2;

export interface OtelConsumerOptions {
  /** OTLP/HTTP traces endpoint, e.g. `https://…/otlp/v1/traces`. */
  readonly endpoint: string;
  /** Extra request headers (auth). Merged over `content-type: application/json`. */
  readonly headers?: Readonly<Record<string, string>>;
  /** `service.name` resource attribute. */
  readonly serviceName?: string;
  /**
   * Head-sampling ratio in [0, 1] — the fraction of requests collected at
   * all. Omitted = every request.
   */
  readonly sample?: number;
  /**
   * Tail vote on the finished snapshot, e.g. keep all errors plus a slice of
   * successes. Returning false drops the export after collection.
   */
  readonly tailSample?: (snapshot: TelemetrySnapshot) => boolean;
  /** Transport override; defaults to global `fetch`. */
  readonly fetch?: typeof globalThis.fetch;
}

function randomHex(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Epoch milliseconds → OTLP nanosecond string (exceeds Number range). */
function unixNano(ms: number): string {
  return (BigInt(Math.round(ms)) * 1_000_000n).toString();
}

/**
 * OTLP attribute values are primitives or arrays of primitives; nested
 * structures are JSON-stringified rather than projected onto `kvlistValue`.
 */
function toAnyValue(value: JsonValue): OtlpValue {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { boolValue: value };
  if (typeof value === "number") {
    // Beyond the safe range `String(n)` isn't a parseable int64 ("1e+21");
    // a strict collector rejects the whole batch over one bad attribute.
    return Number.isSafeInteger(value)
      ? { intValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value) && value.every((v) => typeof v !== "object")) {
    return { arrayValue: { values: value.map(toAnyValue) } };
  }
  return { stringValue: JSON.stringify(value) };
}

// `Array.isArray` alone won't exclude `readonly JsonValue[]` from the union.
function isJsonObject(
  value: JsonValue,
): value is Readonly<Record<string, JsonValue>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toAttributes(
  record: Readonly<Record<string, JsonValue>>,
): OtlpKeyValue[] {
  return Object.entries(record).map(([key, value]) => ({
    key,
    value: toAnyValue(value),
  }));
}

/** Depth-first projection of the collected tree, minting span ids on the way. */
function addTreeSpans(
  spans: readonly TelemetrySpan[],
  traceId: string,
  parentSpanId: string,
  out: OtlpSpan[],
): void {
  for (const span of spans) {
    const spanId = randomHex(8);
    const endTimeUnixNano = unixNano(span.startedAt + span.durationMs);
    out.push({
      traceId,
      spanId,
      parentSpanId,
      name: span.name,
      kind: SPAN_KIND_INTERNAL,
      startTimeUnixNano: unixNano(span.startedAt),
      endTimeUnixNano,
      attributes: toAttributes(span.attributes),
      ...(span.error && {
        events: [
          {
            timeUnixNano: endTimeUnixNano,
            name: "exception",
            attributes: toAttributes({
              "exception.type": span.error.name,
              "exception.message": span.error.message,
              ...(span.error.stack && {
                "exception.stacktrace": span.error.stack,
              }),
            }),
          },
        ],
      }),
      status:
        span.status === "error"
          ? { code: STATUS_CODE_ERROR, message: span.error?.message }
          : {},
    });
    addTreeSpans(span.children, traceId, spanId, out);
  }
}

/** Timestamped records → root-span events, the namespace as event name. */
function recordEvents(records: TelemetrySnapshot["records"]): OtlpEvent[] {
  return Object.entries(records).flatMap(([namespace, entries]) =>
    entries.map((record) => {
      const data = record.data as JsonValue;
      return {
        timeUnixNano: unixNano(record.at),
        name: namespace,
        // Object payloads flatten into event attributes; anything else
        // rides a single `data` attribute.
        attributes: isJsonObject(data)
          ? toAttributes(data)
          : toAttributes({ data }),
      };
    }),
  );
}

/**
 * W3C trace-context `traceparent`: version-traceId-parentSpanId-flags. A
 * valid inbound header joins this request's spans to the caller's trace;
 * anything else (absent, malformed, all-zero ids, reserved version) is
 * ignored and a fresh trace id is minted.
 */
const TRACEPARENT_PATTERN =
  /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;

function parseTraceparent(
  header: string | null,
): { traceId: string; parentSpanId: string } | null {
  const match = header ? TRACEPARENT_PATTERN.exec(header) : null;
  if (!match) return null;
  const [, version = "", traceId = "", parentSpanId = ""] = match;
  if (version === "ff") return null;
  if (/^0+$/.test(traceId) || /^0+$/.test(parentSpanId)) return null;
  return { traceId, parentSpanId };
}

// No route abstraction reaches the snapshot; the raw path is the best label
// a CMS has. Deliberate semconv deviation (`{method} {route}` is preferred).
function rootSpanName(method: string, url: string): string {
  try {
    return `${method} ${new URL(url).pathname}`;
  } catch {
    return method;
  }
}

// The envelope url keeps its query string and the exporter owns scrubbing
// query-borne secrets (see TelemetrySnapshot) — drop the query wholesale.
function scrubUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
  } catch {
    return url;
  }
}

/**
 * OTel trace exporter as a telemetry consumer: projects each collected
 * snapshot onto an OTLP/HTTP JSON `ExportTraceServiceRequest` and POSTs it
 * per request (from `waitUntil`, so export latency never blocks a response).
 * Core spans carry no ids — trace/span ids are minted here at export time.
 */
export function otelConsumer(options: OtelConsumerOptions): TelemetryConsumer {
  const { sample, tailSample } = options;
  return {
    id: "otel",
    ...(sample !== undefined && { sample: () => Math.random() < sample }),
    onRequestEnd: async (snapshot, ctx) => {
      if (tailSample && !tailSample(snapshot)) return;
      // A failed export is an observability gap, never a request failure:
      // the mapping too (records are `unknown` at runtime and can defeat
      // JSON.stringify) — log and swallow so this promise cannot reject
      // into `waitUntil`.
      try {
        const { request, spans: tree, records, dropped } = snapshot;
        const inbound = parseTraceparent(
          ctx.request.headers.get("traceparent"),
        );
        const traceId = inbound?.traceId ?? randomHex(16);
        const rootSpanId = randomHex(8);
        const droppedRecords = Object.values(dropped.records).reduce(
          (sum, count) => sum + count,
          0,
        );
        const spans: OtlpSpan[] = [
          {
            traceId,
            spanId: rootSpanId,
            ...(inbound && { parentSpanId: inbound.parentSpanId }),
            name: rootSpanName(request.method, request.url),
            kind: SPAN_KIND_SERVER,
            startTimeUnixNano: unixNano(request.startedAt),
            endTimeUnixNano: unixNano(request.startedAt + request.durationMs),
            attributes: toAttributes({
              "http.request.method": request.method,
              "url.full": scrubUrl(request.url),
              "http.response.status_code": request.status,
              "plumix.request_id": request.requestId,
              // OTLP spans carry no dropped-child-span field; the cap
              // overflow rides an attribute so truncation stays visible
              // downstream.
              ...(dropped.spans > 0 && {
                "plumix.dropped_spans": dropped.spans,
              }),
            }),
            events: recordEvents(records),
            ...(droppedRecords > 0 && { droppedEventsCount: droppedRecords }),
            // HTTP server semconv: only 5xx marks the server span failed.
            status: request.status >= 500 ? { code: STATUS_CODE_ERROR } : {},
          },
        ];
        addTreeSpans(tree, traceId, rootSpanId, spans);
        const body = {
          resourceSpans: [
            {
              resource: {
                attributes: toAttributes({
                  "service.name": options.serviceName ?? "plumix",
                }),
              },
              scopeSpans: [{ scope: { name: "plumix" }, spans }],
            },
          ],
        };
        const headers = new Headers(options.headers);
        headers.set("content-type", "application/json");
        const response = await (options.fetch ?? fetch)(options.endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        if (response.ok) {
          // An unread body holds the connection open on Workers.
          void response.body?.cancel();
        } else {
          ctx.logger.error(
            `[plumix] otel export failed: ${String(response.status)} ${response.statusText} ${await response.text()}`,
          );
        }
      } catch (error) {
        ctx.logger.error(
          `[plumix] otel export failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}

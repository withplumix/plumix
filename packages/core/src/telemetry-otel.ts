import type { JsonObject, JsonValue } from "./json.js";
import type {
  TelemetryConsumerFor,
  TelemetrySnapshot,
  TelemetrySpan,
  TelemetrySpanLog,
} from "./telemetry-snapshot.js";
import { isJsonObject } from "./json.js";

/** The primitive subset of OTLP/JSON `AnyValue` the exporter emits. */
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

interface OtlpLogRecord {
  timeUnixNano: string;
  severityNumber: number;
  severityText: string;
  body: OtlpValue;
  attributes: OtlpKeyValue[];
  traceId: string;
  spanId: string;
}

const SEVERITY: Readonly<
  Record<TelemetrySpanLog["level"], { number: number; text: string }>
> = {
  debug: { number: 5, text: "DEBUG" },
  info: { number: 9, text: "INFO" },
  warn: { number: 13, text: "WARN" },
  error: { number: 17, text: "ERROR" },
};

const SPAN_KIND_INTERNAL = 1;
const SPAN_KIND_SERVER = 2;
const STATUS_CODE_ERROR = 2;

export interface OtelConsumerOptions {
  /** OTLP/HTTP traces endpoint, e.g. `https://…/otlp/v1/traces`. */
  readonly endpoint: string;
  /**
   * Extra request headers (auth). Merged over `content-type: application/json`.
   */
  readonly headers?: Readonly<Record<string, string>>;
  /**
   * OTLP/HTTP logs endpoint, e.g. `https://…/otlp/v1/logs`. Set, each span
   * log exports as a log record linked to its span, sent with `headers`.
   */
  readonly logsEndpoint?: string;
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

/** A string because nanoseconds exceed the Number range. */
function unixNano(ms: number): string {
  return (BigInt(Math.round(ms)) * 1_000_000n).toString();
}

/**
 * Nested structures are JSON-stringified rather than projected onto
 * `kvlistValue`.
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

function toAttributes(record: JsonObject): OtlpKeyValue[] {
  return Object.entries(record).map(([key, value]) => ({
    key,
    value: toAnyValue(value),
  }));
}

function addTreeSpans(
  spans: readonly TelemetrySpan[],
  traceId: string,
  parentSpanId: string,
  out: OtlpSpan[],
  logs: OtlpLogRecord[],
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
    for (const log of span.logs) {
      const severity = SEVERITY[log.level];
      logs.push({
        timeUnixNano: unixNano(log.at),
        severityNumber: severity.number,
        severityText: severity.text,
        body: { stringValue: log.message },
        attributes: toAttributes(log.attributes),
        traceId,
        spanId,
      });
    }
    addTreeSpans(span.children, traceId, spanId, out, logs);
  }
}

function recordEvents(records: TelemetrySnapshot["records"]): OtlpEvent[] {
  return Object.entries(records).flatMap(([namespace, entries]) =>
    entries.map((record) => {
      const data = record.data;
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
 * An invalid inbound header (malformed, all-zero ids, reserved version) is
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

/**
 * No route abstraction reaches the snapshot; the raw path is the best label
 * a CMS has. Deliberate semconv deviation (`{method} {route}` is preferred).
 */
function rootSpanName(method: string, url: string): string {
  try {
    return `${method} ${new URL(url).pathname}`;
  } catch {
    return method;
  }
}

/**
 * The envelope url keeps its query string and the exporter owns scrubbing
 * query-borne secrets (see TelemetrySnapshot) — drop the query wholesale.
 */
function scrubUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
  } catch {
    return url;
  }
}

/**
 * What the exporter reads off the request's context: the inbound
 * `traceparent`, and where to report a failed export.
 */
interface ExportContext {
  readonly request: Request;
  readonly logger: { error(message: string): void };
}

async function postExport(
  fetchFn: typeof globalThis.fetch,
  url: string,
  headers: Headers,
  body: unknown,
  logger: ExportContext["logger"],
): Promise<void> {
  try {
    const response = await fetchFn(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (response.ok) {
      // An unread body holds the connection open on Workers.
      void response.body?.cancel();
    } else {
      logger.error(
        `[plumix] otel export failed: ${String(response.status)} ${response.statusText} ${await response.text()}`,
      );
    }
  } catch (error) {
    logger.error(
      `[plumix] otel export failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * POSTs from `waitUntil`, so export latency never blocks a response.
 * Trace and span ids are minted here, at export time.
 */
export function otelConsumer(
  options: OtelConsumerOptions,
): TelemetryConsumerFor<ExportContext> {
  const { sample, tailSample } = options;
  return {
    id: "otel",
    ...(sample !== undefined && { sample: () => Math.random() < sample }),
    onRequestEnd: async (snapshot, ctx) => {
      if (tailSample && !tailSample(snapshot)) return;
      // A failed export is an observability gap, never a request failure, so
      // this promise must not reject into `waitUntil`.
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
              // Gated, so a site without `logsEndpoint` gets the same traces payload.
              ...(options.logsEndpoint !== undefined &&
                dropped.logs > 0 && {
                  "plumix.dropped_logs": dropped.logs,
                }),
            }),
            events: recordEvents(records),
            ...(droppedRecords > 0 && { droppedEventsCount: droppedRecords }),
            // HTTP server semconv: only 5xx marks the server span failed.
            status: request.status >= 500 ? { code: STATUS_CODE_ERROR } : {},
          },
        ];
        const logRecords: OtlpLogRecord[] = [];
        addTreeSpans(tree, traceId, rootSpanId, spans, logRecords);
        const resource = {
          attributes: toAttributes({
            "service.name": options.serviceName ?? "plumix",
          }),
        };
        const scope = { name: "plumix" };
        const headers = new Headers(options.headers);
        headers.set("content-type", "application/json");
        const post = (url: string, body: unknown): Promise<void> =>
          postExport(options.fetch ?? fetch, url, headers, body, ctx.logger);
        await Promise.all([
          post(options.endpoint, {
            resourceSpans: [{ resource, scopeSpans: [{ scope, spans }] }],
          }),
          options.logsEndpoint !== undefined &&
            logRecords.length > 0 &&
            post(options.logsEndpoint, {
              resourceLogs: [{ resource, scopeLogs: [{ scope, logRecords }] }],
            }),
        ]);
      } catch (error) {
        ctx.logger.error(
          `[plumix] otel export failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}

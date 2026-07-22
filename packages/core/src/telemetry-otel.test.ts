import { describe, expect, test } from "vitest";

import type { AnyPluginDescriptor } from "./config.js";
import type { AppContext } from "./context/app.js";
import type { TelemetrySnapshot } from "./context/telemetry.js";
import type { OtelConsumerOptions } from "./telemetry-otel.js";
import type { ThemeDescriptor } from "./theme.js";
import { definePlugin } from "./plugin/define.js";
import { fallback } from "./route/render/template-builders.js";
import { otelConsumer } from "./telemetry-otel.js";
import { createDispatcherHarness } from "./test/dispatcher.js";
import { defineTheme } from "./theme.js";

/** OTLP/JSON AnyValue — the subset the exporter emits. */
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
  attributes?: OtlpKeyValue[];
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
  status: { code?: number; message?: string };
  droppedEventsCount?: number;
}

interface OtlpExportRequest {
  resourceSpans: {
    resource: { attributes: OtlpKeyValue[] };
    scopeSpans: { scope: { name: string }; spans: OtlpSpan[] }[];
  }[];
}

interface ExportCall {
  url: string;
  init: RequestInit;
}

const ENDPOINT = "https://otlp.example/v1/traces";

function must<T>(value: T | null | undefined, label: string): T {
  if (value == null) throw new Error(`missing ${label}`);
  return value;
}

function capturingFetch(): { calls: ExportCall[]; fetchStub: typeof fetch } {
  const calls: ExportCall[] = [];
  const fetchStub = ((
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    calls.push({ url, init: init ?? {} });
    return Promise.resolve(new Response(null, { status: 200 }));
  }) as typeof fetch;
  return { calls, fetchStub };
}

/**
 * Harness with the otel consumer plus a probe consumer capturing the raw
 * snapshot, so assertions can compare the export against what was collected.
 */
async function otelHarness(
  consumer: Partial<OtelConsumerOptions> = {},
  harness: {
    plugins?: readonly AnyPluginDescriptor[];
    theme?: ThemeDescriptor;
  } = {},
): Promise<{
  h: Awaited<ReturnType<typeof createDispatcherHarness>>;
  calls: ExportCall[];
  snapshots: TelemetrySnapshot[];
}> {
  const { calls, fetchStub } = capturingFetch();
  const snapshots: TelemetrySnapshot[] = [];
  const h = await createDispatcherHarness({
    ...harness,
    telemetry: {
      consumers: [
        otelConsumer({ endpoint: ENDPOINT, fetch: fetchStub, ...consumer }),
        { id: "probe", onRequestEnd: (s) => void snapshots.push(s) },
      ],
    },
  });
  return { h, calls, snapshots };
}

function exportedRequest(call: ExportCall | undefined): OtlpExportRequest {
  const body = must(call, "export call").init.body;
  if (typeof body !== "string") throw new Error("expected a string body");
  return JSON.parse(body) as OtlpExportRequest;
}

function exportedSpans(call: ExportCall | undefined): OtlpSpan[] {
  const scope = exportedRequest(call).resourceSpans[0]?.scopeSpans[0];
  return must(scope, "scope spans").spans;
}

function attr(span: OtlpSpan | undefined, key: string): OtlpValue | undefined {
  return span?.attributes.find((kv) => kv.key === key)?.value;
}

describe("otelConsumer — OTLP/HTTP trace export", () => {
  test("a dispatched request exports a valid ExportTraceServiceRequest: root SERVER span from the envelope, span tree as children", async () => {
    const { h, calls, snapshots } = await otelHarness({
      headers: { Authorization: "Basic dGVzdA==" },
    });

    const response = await h.dispatch(new Request("https://cms.example/"));
    await h.drainDeferred();

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe(ENDPOINT);
    expect(call?.init.method).toBe("POST");
    const headers = new Headers(call?.init.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("authorization")).toBe("Basic dGVzdA==");

    const body = exportedRequest(call);
    const resource = body.resourceSpans[0]?.resource;
    expect(resource?.attributes).toContainEqual({
      key: "service.name",
      value: { stringValue: "plumix" },
    });

    const spans = exportedSpans(call);
    const root = spans.find((s) => !s.parentSpanId);
    expect(root).toBeDefined();
    expect(root?.name).toBe("GET /");
    expect(root?.kind).toBe(2); // SPAN_KIND_SERVER
    expect(root?.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(root?.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(attr(root, "http.request.method")).toEqual({ stringValue: "GET" });
    expect(attr(root, "url.full")).toEqual({
      stringValue: "https://cms.example/",
    });
    expect(attr(root, "http.response.status_code")).toEqual({
      intValue: String(response.status),
    });

    // Envelope timing survives the mapping exactly (ms epoch → ns strings).
    const envelope = must(snapshots[0], "probe snapshot").request;
    expect(root?.startTimeUnixNano).toBe(
      String(BigInt(envelope.startedAt) * 1_000_000n),
    );
    expect(root?.endTimeUnixNano).toBe(
      String(BigInt(envelope.startedAt + envelope.durationMs) * 1_000_000n),
    );

    // The collected tree ("dispatch" and descendants) hangs off the root
    // SERVER span, every span sharing one trace id and a valid parent chain.
    const dispatch = spans.find((s) => s.name === "dispatch");
    expect(dispatch?.parentSpanId).toBe(root?.spanId);
    expect(dispatch?.kind).toBe(1); // SPAN_KIND_INTERNAL
    const ids = new Set(spans.map((s) => s.spanId));
    expect(ids.size).toBe(spans.length);
    for (const span of spans) {
      expect(span.traceId).toBe(root?.traceId);
      if (span.parentSpanId) expect(ids.has(span.parentSpanId)).toBe(true);
    }
  });

  test("the query string is scrubbed from url.full — exporters own query-borne secrets", async () => {
    const { h, calls } = await otelHarness();

    await h.dispatch(
      new Request("https://cms.example/reset?token=hush&plain=1"),
    );
    await h.drainDeferred();

    const root = exportedSpans(calls[0]).find((s) => !s.parentSpanId);
    expect(attr(root, "url.full")).toEqual({
      stringValue: "https://cms.example/reset",
    });
  });

  test("span attributes map to OTLP values; nested objects and mixed arrays are JSON-stringified", async () => {
    const attributed = definePlugin("attributed", (ctx) => {
      ctx.addFilter("render:document", (manifest, _data, appCtx) => {
        appCtx.telemetry.span("attributed", (s) => {
          s.set("str", "hello");
          s.set("int", 42);
          s.set("float", 1.5);
          s.set("bool", true);
          s.set("unsafe-int", 1e21);
          s.set("primitive-array", ["a", "b"]);
          s.set("nested-object", { deep: { deeper: 1 } });
          s.set("mixed-array", [{ id: 1 }, "x"]);
        });
        return manifest;
      });
    });
    const { h, calls } = await otelHarness({}, { plugins: [attributed] });

    await h.dispatch(new Request("https://cms.example/"));
    await h.drainDeferred();

    const span = exportedSpans(calls[0]).find((s) => s.name === "attributed");
    expect(attr(span, "str")).toEqual({ stringValue: "hello" });
    expect(attr(span, "int")).toEqual({ intValue: "42" });
    expect(attr(span, "float")).toEqual({ doubleValue: 1.5 });
    expect(attr(span, "bool")).toEqual({ boolValue: true });
    // Beyond int64/precision range `String(n)` isn't a valid intValue — a
    // strict collector would reject the whole batch.
    expect(attr(span, "unsafe-int")).toEqual({ doubleValue: 1e21 });
    expect(attr(span, "primitive-array")).toEqual({
      arrayValue: { values: [{ stringValue: "a" }, { stringValue: "b" }] },
    });
    expect(attr(span, "nested-object")).toEqual({
      stringValue: '{"deep":{"deeper":1}}',
    });
    expect(attr(span, "mixed-array")).toEqual({
      stringValue: '[{"id":1},"x"]',
    });
  });

  test("a 500 request maps to STATUS_ERROR on the root span and exception events on failed spans", async () => {
    const { h, calls } = await otelHarness(
      {},
      {
        theme: defineTheme({
          templates: [
            fallback(() => {
              throw new Error("render kaboom");
            }),
          ],
        }),
      },
    );

    const response = await h.dispatch(new Request("https://cms.example/"));
    await h.drainDeferred();

    expect(response.status).toBe(500);
    const spans = exportedSpans(calls[0]);
    const root = spans.find((s) => !s.parentSpanId);
    expect(root?.status.code).toBe(2); // STATUS_CODE_ERROR

    const render = spans.find((s) => s.name === "render");
    expect(render?.status).toEqual({ code: 2, message: "render kaboom" });
    const exception = render?.events?.find((e) => e.name === "exception");
    expect(exception).toBeDefined();
    expect(exception?.timeUnixNano).toBe(render?.endTimeUnixNano);
    const eventAttrs = Object.fromEntries(
      (exception?.attributes ?? []).map((kv) => [kv.key, kv.value]),
    );
    expect(eventAttrs["exception.type"]).toEqual({ stringValue: "Error" });
    expect(eventAttrs["exception.message"]).toEqual({
      stringValue: "render kaboom",
    });
    expect(eventAttrs["exception.stacktrace"]?.stringValue).toContain(
      "render kaboom",
    );
  });

  test("timestamped records become span events on the root, named by namespace", async () => {
    const recorder = definePlugin("recorder", (ctx) => {
      ctx.addFilter("render:document", (manifest, _data, appCtx) => {
        appCtx.telemetry.record("recorder", { note: "during render" });
        appCtx.telemetry.record("recorder", "plain fact");
        return manifest;
      });
    });
    const { h, calls, snapshots } = await otelHarness(
      {},
      { plugins: [recorder] },
    );

    await h.dispatch(new Request("https://cms.example/"));
    await h.drainDeferred();

    const root = exportedSpans(calls[0]).find((s) => !s.parentSpanId);
    const events = root?.events?.filter((e) => e.name === "recorder");
    expect(events).toHaveLength(2);
    // Object payloads flatten into event attributes; primitives keep a
    // single `data` attribute.
    expect(events?.[0]?.attributes).toContainEqual({
      key: "note",
      value: { stringValue: "during render" },
    });
    expect(events?.[1]?.attributes).toContainEqual({
      key: "data",
      value: { stringValue: "plain fact" },
    });
    const recorded = snapshots[0]?.records.recorder;
    expect(events?.map((e) => e.timeUnixNano)).toEqual(
      recorded?.map((r) => String(BigInt(r.at) * 1_000_000n)),
    );
  });

  test("cap-dropped spans and records surface as OTel dropped counts on the root span", async () => {
    const noisy = definePlugin("noisy", (ctx) => {
      ctx.addFilter("render:document", (manifest, _data, appCtx) => {
        for (let i = 0; i < 1002; i++) {
          appCtx.telemetry.record("noisy", i);
        }
        for (let i = 0; i < 2100; i++) {
          appCtx.telemetry.span("busy", () => undefined);
        }
        return manifest;
      });
    });
    const { h, calls, snapshots } = await otelHarness({}, { plugins: [noisy] });

    await h.dispatch(new Request("https://cms.example/"));
    await h.drainDeferred();

    const [snapshot] = snapshots;
    expect(snapshot?.dropped.spans).toBeGreaterThan(0);
    expect(snapshot?.dropped.records.noisy).toBe(2);

    const root = exportedSpans(calls[0]).find((s) => !s.parentSpanId);
    expect(root?.droppedEventsCount).toBe(2);
    // OTLP spans carry no dropped-child-span field; the count rides a
    // plumix attribute so a truncated trace is never mistaken for complete.
    expect(attr(root, "plumix.dropped_spans")).toEqual({
      intValue: String(snapshot?.dropped.spans),
    });
  });

  test("sample ratio head-samples: 0 never exports, 1 always does", async () => {
    const never = await otelHarness({ sample: 0 });
    const always = await otelHarness({ sample: 1 });

    await never.h.dispatch(new Request("https://cms.example/"));
    await never.h.drainDeferred();
    await always.h.dispatch(new Request("https://cms.example/"));
    await always.h.drainDeferred();

    expect(never.calls).toHaveLength(0);
    expect(always.calls).toHaveLength(1);
  });

  test("tailSample can drop a collected snapshot before posting", async () => {
    const seen: TelemetrySnapshot[] = [];
    const { h, calls } = await otelHarness({
      tailSample: (snapshot) => {
        seen.push(snapshot);
        return snapshot.request.status >= 500;
      },
    });

    await h.dispatch(new Request("https://cms.example/"));
    await h.drainDeferred();

    // The predicate saw the collected snapshot and vetoed the 200 export.
    expect(seen).toHaveLength(1);
    expect(seen[0]?.request.status).toBeLessThan(500);
    expect(calls).toHaveLength(0);
  });

  test("a valid inbound traceparent joins the caller's trace: its trace id and parent span id are honored", async () => {
    const { h, calls } = await otelHarness();

    await h.dispatch(
      new Request("https://cms.example/", {
        headers: {
          traceparent:
            "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        },
      }),
    );
    await h.drainDeferred();

    const spans = exportedSpans(calls[0]);
    const root = spans.find((s) => s.kind === 2);
    expect(root?.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(root?.parentSpanId).toBe("00f067aa0ba902b7");
    for (const span of spans) {
      expect(span.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    }
  });

  test("an invalid traceparent falls back to a random trace id and a parentless root", async () => {
    const { h, calls } = await otelHarness();

    // All-zero trace id is explicitly invalid per W3C trace-context.
    await h.dispatch(
      new Request("https://cms.example/", {
        headers: {
          traceparent:
            "00-00000000000000000000000000000000-00f067aa0ba902b7-01",
        },
      }),
    );
    await h.drainDeferred();

    const root = exportedSpans(calls[0]).find((s) => s.kind === 2);
    expect(root?.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(root?.traceId).not.toBe("00000000000000000000000000000000");
    expect(root?.parentSpanId).toBeUndefined();
  });

  test("export failures — transport, backend refusal, unserializable payload — are logged, never rejected", async () => {
    const errors: string[] = [];
    const fakeCtx = {
      request: new Request("https://cms.example/"),
      logger: { error: (message: string) => void errors.push(message) },
    } as unknown as AppContext;
    const snapshot: TelemetrySnapshot = {
      request: {
        requestId: "req-1",
        method: "GET",
        url: "https://cms.example/",
        status: 200,
        startedAt: 1_700_000_000_000,
        durationMs: 12,
      },
      spans: [],
      records: {},
      dropped: { spans: 0, records: {} },
    };

    const rejecting = otelConsumer({
      endpoint: ENDPOINT,
      fetch: () => Promise.reject(new Error("network down")),
    });
    await expect(
      must(rejecting.onRequestEnd, "onRequestEnd")(snapshot, fakeCtx),
    ).resolves.toBeUndefined();
    expect(errors.some((m) => m.includes("network down"))).toBe(true);

    // A non-2xx backend response is a failed export too — logged, not thrown.
    const refused = otelConsumer({
      endpoint: ENDPOINT,
      fetch: () => Promise.resolve(new Response("bad auth", { status: 401 })),
    });
    await expect(
      must(refused.onRequestEnd, "onRequestEnd")(snapshot, fakeCtx),
    ).resolves.toBeUndefined();
    expect(errors.some((m) => m.includes("401"))).toBe(true);

    // A snapshot the mapping itself chokes on (records are `unknown` at
    // runtime — a plugin can hand over a cycle) must fail the same way.
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const poisoned: TelemetrySnapshot = {
      ...snapshot,
      records: { bad: [{ at: 1_700_000_000_000, data: circular }] },
    };
    const { calls, fetchStub } = capturingFetch();
    const choking = otelConsumer({ endpoint: ENDPOINT, fetch: fetchStub });
    await expect(
      must(choking.onRequestEnd, "onRequestEnd")(poisoned, fakeCtx),
    ).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
    expect(errors.some((m) => m.includes("otel export failed"))).toBe(true);
  });
});

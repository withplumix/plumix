import type { AppContext } from "../context/app.js";
import type { TelemetrySnapshot } from "../context/telemetry.js";

/**
 * Post-execution seam: hand each sampled consumer the finished snapshot via
 * `ctx.defer` (CF Workers' `waitUntil`), so awaited export I/O never blocks
 * the response. Consumers are isolated — one rejecting doesn't starve the
 * rest, and `wrapDefer` logs the rejection. Runs on the error path too: a
 * 500 is exactly the request a consumer wants to see.
 *
 * Shared by every execution path that finishes a collected trace: the request
 * dispatcher (real response status) and the scheduled runner (synthetic 200 —
 * task failures live in the span tree, not the envelope).
 */
export function deliverTelemetrySnapshot(
  ctx: AppContext,
  status: number,
  startedAt: number,
): void {
  const deliveries = (ctx.telemetryConsumers ?? []).flatMap((c) =>
    c.onRequestEnd ? [c.onRequestEnd] : [],
  );
  if (deliveries.length === 0) return;
  const snapshot: TelemetrySnapshot = {
    request: {
      requestId: ctx.requestId,
      method: ctx.request.method,
      url: ctx.request.url,
      status,
      startedAt,
      durationMs: Date.now() - startedAt,
    },
    // getRecords/getDropped return copies; spans are copied here because
    // getSpans stays the live mid-request read (the debug bar's). Detachment
    // matters: post-response work through the same ctx must not grow the
    // arrays a consumer is serializing.
    spans: [...ctx.telemetry.getSpans()],
    records: ctx.telemetry.getRecords(),
    dropped: ctx.telemetry.getDropped(),
  };
  for (const onRequestEnd of deliveries) {
    // `.then` defers the callback past the dispatcher's return and folds a
    // synchronous throw into the promise the defer wrapper logs.
    ctx.defer(Promise.resolve().then(() => onRequestEnd(snapshot, ctx)));
  }
}

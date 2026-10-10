import type { AppContext } from "../context/app-context.js";
import type { TelemetrySnapshot } from "../context/telemetry.js";

/**
 * Deferred, so export I/O never blocks the response; one consumer rejecting
 * doesn't starve the rest. Call it on error paths too.
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
    // `getSpans` is the live read, so copy it: post-response work must not grow
    // an array a consumer is serializing.
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

import type { AppContext } from "../context/app-context.js";
import type {
  TelemetryRequestEnvelope,
  TelemetrySnapshot,
} from "../context/telemetry.js";
import { logErrorSafely } from "../context/log.js";

/**
 * How long a snapshot waits for the request's deferred work; a fixed core
 * value (ADR 0053).
 */
const DELIVERY_DEADLINE_MS = 10_000;

/**
 * Deferred itself: the snapshot is built once the request's deferred work has
 * settled, at the deadline or at a shutdown, whichever is first. Call it on
 * error paths too.
 */
export function deliverTelemetrySnapshot(
  ctx: AppContext,
  status: number,
  startedAt: number,
): void {
  const deliveries = (ctx.telemetryConsumers ?? []).flatMap((c) =>
    c.onRequestEnd ? [c.onRequestEnd] : [],
  );
  const delivery = ctx.telemetryDelivery;
  if (deliveries.length === 0 || delivery === undefined) return;
  // Measured now: the request's duration ends at its response, not when the
  // work it deferred settles.
  const request: TelemetryRequestEnvelope = {
    requestId: ctx.requestId,
    method: ctx.request.method,
    url: ctx.request.url,
    status,
    startedAt,
    durationMs: Date.now() - startedAt,
  };
  const { shutdown } = delivery;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waiting = new Promise<void>((resolve) => {
    let delivered = false;
    const deliver = (): void => {
      if (delivered) return;
      delivered = true;
      clearTimeout(timer);
      shutdown?.removeEventListener("abort", deliver);
      const snapshot: TelemetrySnapshot = {
        request,
        spans: delivery.spansAt(Date.now()),
        records: ctx.telemetry.getRecords(),
        dropped: ctx.telemetry.getDropped(),
      };
      for (const onRequestEnd of deliveries) {
        // The executor folds a synchronous throw into the promise, and runs
        // now, so a shutdown has every consumer called before it returns.
        const exported = new Promise<void>((done) => {
          done(onRequestEnd(snapshot, ctx));
        }).catch((error: unknown) => {
          logErrorSafely(
            ctx.logger,
            "[plumix] deferred promise rejected",
            error,
          );
        });
        if (delivery.defer) delivery.defer(exported);
      }
      resolve();
    };
    timer = setTimeout(deliver, DELIVERY_DEADLINE_MS);
    if (shutdown?.aborted) deliver();
    shutdown?.addEventListener("abort", deliver, { once: true });
    void delivery.settled().then(deliver);
  });
  // A shutdown signal holds the delivery itself, so a drain counts only the
  // work it gave up on.
  if (shutdown === undefined && delivery.defer) delivery.defer(waiting);
}

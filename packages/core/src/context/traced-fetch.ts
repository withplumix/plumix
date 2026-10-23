import type { PlumixFetch } from "./app-context.js";
import type { TelemetryCollector } from "./telemetry.js";

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * The span label carries the host (not the full URL) so a timeline groups
 * calls per upstream; the full URL lives in the `url.full` attribute.
 */
function spanName(method: string, url: string): string {
  const host = URL.parse(url)?.host;
  return host ? `fetch: ${method} ${host}` : `fetch: ${method}`;
}

/**
 * The collector is read per call so its post-vote activation is observed. No
 * `traceparent` injection: trace ids don't exist during the request.
 */
export function createTracedFetch(
  getTelemetry: () => TelemetryCollector,
): PlumixFetch {
  return (input, init) => {
    // `init.method` wins over a Request input's method — the same precedence
    // `new Request(input, init)` applies inside fetch itself.
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const url = input instanceof Request ? input.url : String(input);
    const { timeout = DEFAULT_TIMEOUT_MS, ...platformInit } = init ?? {};
    // `init.signal` replaces a Request input's own, so both are kept.
    const callerSignal =
      platformInit.signal ??
      (input instanceof Request ? input.signal : undefined);
    const deadline =
      timeout === false
        ? undefined
        : { ms: timeout, signal: AbortSignal.timeout(timeout) };
    const signals = [callerSignal, deadline?.signal].filter(
      (signal) => signal !== undefined,
    );
    return getTelemetry().span(spanName(method, url), async (s) => {
      s.set("http.request.method", method);
      s.set("url.full", url);
      try {
        const response = await globalThis.fetch(input, {
          ...platformInit,
          ...(deadline && { signal: AbortSignal.any(signals) }),
        });
        s.set("http.response.status_code", response.status);
        return response;
      } catch (error) {
        // The message names the duration so the span says how long the call
        // was given.
        if (deadline?.signal.aborted && error === deadline.signal.reason) {
          throw new DOMException(
            `timed out after ${deadline.ms / 1000}s`,
            "TimeoutError",
          );
        }
        throw error;
      }
    });
  };
}

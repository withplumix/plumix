import type { PlumixFetch } from "../runtime/contract/fetch.js";
import type { TelemetryCollector } from "./telemetry.js";

export const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * The span label carries the host (not the full URL) so a timeline groups
 * calls per upstream; the full URL lives in the `url.full` attribute.
 */
function spanName(method: string, url: string): string {
  const host = URL.parse(url)?.host;
  return host ? `fetch: ${method} ${host}` : `fetch: ${method}`;
}

/** The message names the duration so the span says how long the call was given. */
export function timeoutError(ms: number): DOMException {
  return new DOMException(`timed out after ${ms / 1000}s`, "TimeoutError");
}

/**
 * Each call gets a span around `send`. The collector is read per call to
 * observe its post-vote activation. No `traceparent`: no trace ids exist yet.
 */
export function createTracedFetch(
  getTelemetry: () => TelemetryCollector,
  contextSignal: AbortSignal,
  send: PlumixFetch = boundedFetch(contextSignal),
): PlumixFetch {
  return (input, init) => {
    // `init.method` wins over a Request input's method — the same precedence
    // `new Request(input, init)` applies inside fetch itself.
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const url = input instanceof Request ? input.url : String(input);
    return getTelemetry().span(spanName(method, url), async (s) => {
      s.set("http.request.method", method);
      s.set("url.full", url);
      const response = await send(input, init);
      s.set("http.response.status_code", response.status);
      return response;
    });
  };
}

/** `init.signal` replaces a Request input's own, as it does in the platform's `fetch`. */
export function callerSignal(
  input: Parameters<PlumixFetch>[0],
  init: { readonly signal?: AbortSignal | null } | undefined,
): AbortSignal | undefined {
  return init?.signal ?? (input instanceof Request ? input.signal : undefined);
}

/**
 * `send` (the platform `fetch` by default), with a 10s deadline, following
 * `contextSignal`. The default is read per call so a stubbed global applies.
 */
export function boundedFetch(
  contextSignal: AbortSignal,
  send?: typeof fetch,
): PlumixFetch {
  return async (input, init) => {
    const { timeout = DEFAULT_TIMEOUT_MS, ...platformInit } = init ?? {};
    const caller = callerSignal(input, platformInit);
    const deadline =
      timeout === false
        ? undefined
        : { ms: timeout, signal: AbortSignal.timeout(timeout) };
    const signals = [caller, deadline?.signal, contextSignal].filter(
      (signal) => signal !== undefined,
    );
    try {
      return await (send ?? globalThis.fetch)(input, {
        ...platformInit,
        signal: AbortSignal.any(signals),
      });
    } catch (error) {
      if (deadline?.signal.aborted && error === deadline.signal.reason) {
        throw timeoutError(deadline.ms);
      }
      throw error;
    }
  };
}

import type { TelemetryCollector } from "./telemetry.js";

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
): typeof globalThis.fetch {
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
      const response = await globalThis.fetch(input, init);
      s.set("http.response.status_code", response.status);
      return response;
    });
  };
}

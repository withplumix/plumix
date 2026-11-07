/**
 * `fetch` bounded by default: a call rejects with a `TimeoutError` after 10s.
 * `timeout` tightens that per call, or `false` lifts it for a long download.
 */
export type PlumixFetch = (
  input: RequestInfo | URL,
  init?: RequestInit & { readonly timeout?: number | false },
) => Promise<Response>;

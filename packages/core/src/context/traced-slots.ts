import type { Mailer } from "../auth/mailer/types.js";
import type {
  AssetsBinding,
  ConnectedCache,
  ConnectedObjectStorage,
} from "../runtime/slots.js";
import type { TelemetryCollector } from "./telemetry.js";

/**
 * Platform I/O slot tracing — the counterpart of `createTracedFetch` for the
 * remaining context slots (#1494). Each wrapper is applied once at context
 * assembly; the collector is read per call so the post-vote swap in
 * `createAppContext` is always observed, and with no consumer sampled every
 * span() is the no-op pass-through.
 */
type GetTelemetry = () => TelemetryCollector;

export function traceCache(
  cache: ConnectedCache,
  getTelemetry: GetTelemetry,
): ConnectedCache {
  return {
    match: (request) =>
      getTelemetry().span("cache: match", async (s) => {
        const hit = await cache.match(request);
        s.set("cache.hit", hit !== undefined);
        return hit;
      }),
    put: (request, response, tags) =>
      getTelemetry().span("cache: put", (s) => {
        s.set("cache.tags", () => [...tags]);
        return cache.put(request, response, tags);
      }),
    // Untraced on purpose: purges fire post-response (after the snapshot is
    // delivered), so a span here would dangle as an unfinished root.
    purgeTags: (tags) => cache.purgeTags(tags),
  };
}

export function traceAssets(
  assets: AssetsBinding,
  getTelemetry: GetTelemetry,
): AssetsBinding {
  return {
    fetch: (request) =>
      getTelemetry().span("assets: fetch", async (s) => {
        s.set("url.full", request.url);
        const response = await assets.fetch(request);
        s.set("http.response.status_code", response.status);
        return response;
      }),
  };
}

export function traceStorage(
  storage: ConnectedObjectStorage,
  getTelemetry: GetTelemetry,
): ConnectedObjectStorage {
  const spanned = <T>(
    op: string,
    key: string,
    run: () => Promise<T>,
  ): Promise<T> =>
    getTelemetry().span(`storage: ${op}`, (s) => {
      s.set("storage.key", key);
      return run();
    });
  const presignPut = storage.presignPut?.bind(storage);
  return {
    put: (key, body, opts) =>
      spanned("put", key, () => storage.put(key, body, opts)),
    get: (key, opts) => spanned("get", key, () => storage.get(key, opts)),
    head: (key) => spanned("head", key, () => storage.head(key)),
    delete: (key) => spanned("delete", key, () => storage.delete(key)),
    list: (prefix, opts) =>
      getTelemetry().span("storage: list", (s) => {
        s.set("storage.prefix", prefix ?? "");
        return storage.list(prefix, opts);
      }),
    // URL minting (plain URL math / local signing), not object I/O — spanning
    // it would put 0ms noise rows next to real bucket round-trips.
    url: (key, opts) => storage.url(key, opts),
    ...(presignPut ? { presignPut } : {}),
  };
}

export function traceMailer(
  mailer: Mailer,
  getTelemetry: GetTelemetry,
): Mailer {
  return {
    send: (message) =>
      getTelemetry().span("mailer: send", (s) => {
        s.set("mail.to", message.to);
        s.set("mail.subject", message.subject);
        return mailer.send(message);
      }),
  };
}

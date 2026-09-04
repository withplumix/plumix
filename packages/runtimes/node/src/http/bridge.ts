import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { BridgeError } from "../errors.js";

export const DEFAULT_BODY_SIZE_LIMIT = 1024 * 1024 * 1024;

export type RequestHandler = (
  request: Request,
  meta: { readonly clientAddress?: string },
) => Promise<Response>;

export interface BridgeOptions {
  /**
   * Read scheme, host and client address from `x-forwarded-proto`,
   * `x-forwarded-host` and the rightmost `x-forwarded-for` entry — what a
   * TLS-terminating proxy in front of the process appends. Off by default, so
   * a visitor reaching the process directly cannot forge them.
   */
  readonly trustProxy?: boolean;
  /**
   * Bytes a request body may carry, 1 GiB by default. Enforced as the body
   * streams, so an oversized upload fails when the handler consumes it rather
   * than after the process has buffered it.
   */
  readonly bodySizeLimit?: number;
}

export type RequestListener = (
  req: IncomingMessage,
  res: ServerResponse,
) => void;

// An empty header reads as absent, so a blank `Host` still yields a URL.
function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  return first === "" ? undefined : first;
}

function forwarded(
  req: IncomingMessage,
  options: BridgeOptions,
  name: string,
): string | undefined {
  return options.trustProxy === true ? header(req, name) : undefined;
}

function splitTarget(target: string): [pathname: string, search: string] {
  const query = target.indexOf("?");
  return query === -1
    ? [target, ""]
    : [target.slice(0, query), target.slice(query)];
}

function requestUrl(req: IncomingMessage, options: BridgeOptions): URL {
  const scheme =
    forwarded(req, options, "x-forwarded-proto") ??
    ("encrypted" in req.socket ? "https" : "http");
  const host =
    forwarded(req, options, "x-forwarded-host") ??
    header(req, "host") ??
    `localhost:${req.socket.localPort}`;
  const [pathname, search] = splitTarget(req.url ?? "/");
  // Throws on a path fetch could not route; the listener answers 400.
  decodeURI(pathname);
  // Assigned rather than resolved against the origin: a protocol-relative
  // target would otherwise replace the host the request was for.
  const url = new URL(`${scheme}://${host}`);
  url.pathname = pathname;
  url.search = search;
  return url;
}

function clientAddress(
  req: IncomingMessage,
  options: BridgeOptions,
): string | undefined {
  const last = forwarded(req, options, "x-forwarded-for")
    ?.split(",")
    .at(-1)
    ?.trim();
  return last === undefined || last === "" ? req.socket.remoteAddress : last;
}

function requestHeaders(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    for (const one of Array.isArray(value) ? value : [value]) {
      headers.append(name, one);
    }
  }
  return headers;
}

/**
 * The request body as a stream the handler pulls, counted against the limit
 * as it arrives. Whatever the handler leaves unread is drained once the
 * response is out: Node dumps an unconsumed body itself, but not one a reader
 * started on, and the next request on a keep-alive connection sits behind it.
 */
function requestBody(
  req: IncomingMessage,
  res: ServerResponse,
  limit: number,
): ReadableStream<Uint8Array> {
  let received = 0;
  let delivering = true;
  const drain = () => {
    delivering = false;
    req.resume();
  };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      req.on("data", (chunk: Uint8Array) => {
        if (!delivering) return;
        received += chunk.byteLength;
        if (received > limit) {
          delivering = false;
          controller.error(BridgeError.bodyTooLarge({ limit }));
          return;
        }
        controller.enqueue(chunk);
        if ((controller.desiredSize ?? 0) <= 0) req.pause();
      });
      req.on("end", () => {
        if (delivering) controller.close();
      });
      req.on("error", (error) => {
        if (delivering) controller.error(error);
      });
      req.pause();
    },
    pull() {
      req.resume();
    },
    cancel: drain,
  });
  res.once("finish", () => {
    if (!req.complete) drain();
  });
  return stream;
}

// Tied to the socket rather than the response: `res` emits `close` after a
// normal finish too, while a socket closing mid-request is the client gone.
// The listener comes off on finish so a keep-alive connection serving many
// requests does not collect one per request.
function abortOnDisconnect(
  req: IncomingMessage,
  res: ServerResponse,
): AbortSignal {
  const controller = new AbortController();
  const socket = req.socket;
  const abort = () => controller.abort();
  socket.on("close", abort);
  res.once("finish", () => socket.off("close", abort));
  return controller.signal;
}

function toRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: BridgeOptions,
): Request {
  const method = req.method ?? "GET";
  const bodiless = method === "GET" || method === "HEAD";
  // `duplex` is what lets a streamed body through; the DOM lib omits it.
  const init: RequestInit & { readonly duplex: "half" } = {
    method,
    headers: requestHeaders(req),
    body: bodiless
      ? null
      : requestBody(req, res, options.bodySizeLimit ?? DEFAULT_BODY_SIZE_LIMIT),
    duplex: "half",
    signal: abortOnDisconnect(req, res),
  };
  return new Request(requestUrl(req, options), init);
}

function responseHeaders(
  response: Response,
): Record<string, string | string[]> {
  const headers: Record<string, string | string[]> = {};
  for (const [name, value] of response.headers) {
    if (name !== "set-cookie") headers[name] = value;
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) headers["set-cookie"] = cookies;
  return headers;
}

/** Write a `Response` to the wire; `pipeline` cancels its body if the client leaves. */
export async function writeResponse(
  response: Response,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  res.writeHead(response.status, responseHeaders(response));
  if (response.body === null || req.method === "HEAD") {
    // A producer behind a HEAD would otherwise stay open until collected.
    void response.body?.cancel();
    res.end();
    return;
  }
  await pipeline(Readable.fromWeb(response.body as NodeReadableStream), res);
}

function plain(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, { "content-type": "text/plain" }).end(text);
}

/**
 * Bridge `node:http` into a fetch-shaped handler. Shared by the production
 * entry and the dev middleware, so both see the same request.
 */
export function createRequestListener(
  handle: RequestHandler,
  options: BridgeOptions = {},
): RequestListener {
  return (req, res) => {
    let request: Request;
    try {
      // Node parses more than fetch routes: a path `decodeURI` rejects, a
      // `Host` the URL parser refuses, a method `Request` forbids (TRACE).
      request = toRequest(req, res, options);
    } catch {
      plain(res, 400, "Bad Request");
      return;
    }
    Promise.resolve()
      .then(() =>
        handle(request, { clientAddress: clientAddress(req, options) }),
      )
      .then((response) => writeResponse(response, req, res))
      .catch(() => {
        // Mid-body there is nothing left to say — the client went away or
        // the body failed — so the socket closes rather than lies.
        if (res.headersSent) {
          res.destroy();
          return;
        }
        plain(res, 500, "Internal Server Error");
      });
  };
}

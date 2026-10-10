import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { RequestTrustOptions, TrustedRequest } from "plumix/runtime";
import { trustRequest } from "plumix/runtime";

import { BridgeError } from "../errors.js";

export const DEFAULT_BODY_SIZE_LIMIT = 1024 * 1024 * 1024;

export type RequestHandler = (
  request: Request,
  meta: { readonly clientAddress?: string },
) => Promise<Response>;

export interface BridgeOptions extends RequestTrustOptions {
  /**
   * 1 GiB by default. Enforced as the body streams, so an oversized upload
   * fails before it is buffered.
   */
  readonly bodySizeLimit?: number;
}

export type RequestListener = (
  req: IncomingMessage,
  res: ServerResponse,
) => void;

function splitTarget(target: string): [pathname: string, search: string] {
  const query = target.indexOf("?");
  return query === -1
    ? [target, ""]
    : [target.slice(0, query), target.slice(query)];
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
 * Throws on a path fetch could not route or a `Host` a URL cannot carry; the
 * listener answers 400.
 */
export function trustedRequest(
  req: IncomingMessage,
  options: BridgeOptions,
  headers: Headers = requestHeaders(req),
): TrustedRequest {
  const [pathname, search] = splitTarget(req.url ?? "/");
  decodeURI(pathname);
  // Assigned rather than resolved against an origin: a protocol-relative
  // target would otherwise replace the host the request was for.
  const target = new URL("http://localhost");
  target.pathname = pathname;
  target.search = search;
  return trustRequest(
    new Request(target, { headers }),
    {
      // `node:http` serves plain HTTP, in dev and in the built entry alike; a
      // TLS-terminating proxy in front is what `trustProxy` is for.
      scheme: "http",
      port: req.socket.localPort ?? 0,
      remoteAddress: req.socket.remoteAddress,
    },
    options,
  );
}

// Unread body is drained after the response: Node dumps an unconsumed body but
// not a started one, which blocks the next keep-alive request.
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

// On the socket, not `res`, which emits `close` after a normal finish too.
// Removed on finish so keep-alive connections don't accumulate listeners.
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
): { readonly request: Request; readonly clientAddress?: string } {
  const method = req.method ?? "GET";
  const bodiless = method === "GET" || method === "HEAD";
  const headers = requestHeaders(req);
  const { url, clientAddress } = trustedRequest(req, options, headers);
  // `duplex` is what lets a streamed body through; the DOM lib omits it.
  const init: RequestInit & { readonly duplex: "half" } = {
    method,
    headers,
    body: bodiless
      ? null
      : requestBody(req, res, options.bodySizeLimit ?? DEFAULT_BODY_SIZE_LIMIT),
    duplex: "half",
    signal: abortOnDisconnect(req, res),
  };
  return { request: new Request(url, init), clientAddress };
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

/**
 * Write a `Response` to the wire; `pipeline` cancels its body if the client
 * leaves.
 */
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
    let address: string | undefined;
    try {
      // Node parses more than fetch routes: a path `decodeURI` rejects, a
      // `Host` the URL parser refuses, a method `Request` forbids (TRACE).
      ({ request, clientAddress: address } = toRequest(req, res, options));
    } catch {
      plain(res, 400, "Bad Request");
      return;
    }
    Promise.resolve()
      .then(() => handle(request, { clientAddress: address }))
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

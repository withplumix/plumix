import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { RequestTrustOptions } from "plumix/runtime";
import { trustRequest } from "plumix/runtime";

/** A fetch-shaped answer, or `null` to hand the request on. */
export type DevHandler = (
  request: Request,
  clientAddress: string | undefined,
) => Response | null | Promise<Response | null>;

export type DevMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next?: () => void,
) => void;

function toRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: RequestTrustOptions,
): { readonly request: Request; readonly clientAddress?: string } {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    for (const one of Array.isArray(value) ? value : [value]) {
      headers.append(name, one);
    }
  }
  const target = req.url ?? "/";
  const query = target.indexOf("?");
  // Assigned rather than resolved against an origin: a protocol-relative
  // target would otherwise replace the host the request was for.
  const url = new URL("http://localhost");
  url.pathname = query === -1 ? target : target.slice(0, query);
  url.search = query === -1 ? "" : target.slice(query);
  const decided = trustRequest(
    new Request(url, { headers }),
    {
      // Vite's dev server is plain HTTP; a TLS-terminating proxy in front is
      // what `trustProxy` is for.
      scheme: "http",
      port: req.socket.localPort ?? 0,
      remoteAddress: req.socket.remoteAddress,
    },
    options,
  );
  const method = req.method ?? "GET";
  const controller = new AbortController();
  res.once("close", () => {
    if (!res.writableFinished) controller.abort();
  });
  // `duplex` is what lets a streamed body through; the DOM lib omits it.
  const init: RequestInit & { readonly duplex: "half" } = {
    method,
    headers,
    body:
      method === "GET" || method === "HEAD"
        ? null
        : (Readable.toWeb(req) as ReadableStream<Uint8Array>),
    duplex: "half",
    signal: controller.signal,
  };
  return {
    request: new Request(decided.url, init),
    clientAddress: decided.clientAddress,
  };
}

async function writeResponse(
  response: Response,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const headers: Record<string, string | string[]> = {};
  for (const [name, value] of response.headers) {
    if (name !== "set-cookie") headers[name] = value;
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) headers["set-cookie"] = cookies;
  res.writeHead(response.status, headers);
  if (response.body === null || req.method === "HEAD") {
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
 * Vite's dev server speaks `node:http`, which Bun implements, while the site
 * and the assets layer speak fetch: this carries a request across, through
 * the shared trust rules, and the answer back. A `null` answer calls `next`.
 */
export function createDevMiddleware(
  handle: DevHandler,
  options: RequestTrustOptions,
): DevMiddleware {
  return (req, res, next) => {
    let request: Request;
    let clientAddress: string | undefined;
    try {
      ({ request, clientAddress } = toRequest(req, res, options));
    } catch {
      plain(res, 400, "Bad Request");
      return;
    }
    Promise.resolve()
      .then(() => handle(request, clientAddress))
      .then((response) => {
        if (response !== null) return writeResponse(response, req, res);
        if (next) next();
        else plain(res, 404, "Not Found");
      })
      .catch(() => {
        if (res.headersSent) {
          res.destroy();
          return;
        }
        plain(res, 500, "Internal Server Error");
      });
  };
}

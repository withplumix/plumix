import { readFile } from "node:fs/promises";
import type { SourceMapInput } from "@jridgewell/trace-mapping";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import type { ViteDevServer } from "vite";
import { isFileLoadingAllowed, normalizePath } from "vite";

import { isTrustedDevHost } from "@plumix/core";
import {
  DEV_ERROR_CLIENT_ERRORS_ENDPOINT,
  DEV_ERROR_SOURCE_ENDPOINT,
  DEV_ERROR_STACK_ENDPOINT,
  DEV_ERROR_TERMINAL_ENDPOINT,
} from "@plumix/core/dev-client";

import { handleDevErrorSourceRequest } from "./dev-error-source.js";
import {
  handleDevErrorStackRequest,
  resolveClientStack,
} from "./dev-error-stack.js";
import { createTerminalForwarder } from "./dev-error-terminal.js";

/** One endpoint the plumix plugin serves from the dev server. */
export interface DevEndpoint {
  /** A `GET` endpoint answers `HEAD` too. */
  readonly method: "GET" | "POST";
  readonly path: string;
  /** `url` is the request's path and query; `body` is empty for a `GET`. */
  readonly handle: (
    url: string,
    body: string,
  ) => Promise<{ readonly status: number; readonly body: string | null }>;
}

/** The endpoints {@link serveDevEndpoints} registers, for one dev session. */
export function createDevEndpoints(server: ViteDevServer): DevEndpoint[] {
  // Maps a browser module URL to its dev transform sourcemap and file, so the
  // stack and terminal endpoints resolve frames the same way.
  const lookup = async (url: string) => {
    const mod = await server.moduleGraph.getModuleByUrl(url);
    if (!mod) return null;
    // Vite's `SourceMap` is a valid encoded map at runtime; its type just
    // diverges from trace-mapping's `SourceMapInput` (encoded vs decoded
    // `mappings`). The resolver only reads it through `TraceMap`.
    const map = (mod.transformResult?.map ?? null) as SourceMapInput | null;
    return { map, file: mod.file };
  };
  // One instance per dev session holds the collapse state.
  const forwarder = createTerminalForwarder({
    resolveStack: (stack) => resolveClientStack(stack, { lookup }),
    print: (message) => server.config.logger.info(message),
    root: server.config.root,
  });

  return [
    {
      // The worker has no `fs`, so the error page fetches excerpts from here.
      method: "GET",
      path: DEV_ERROR_SOURCE_ENDPOINT,
      handle: (url) =>
        handleDevErrorSourceRequest(url, {
          readFile: (path) => readFile(path, "utf8"),
          // Vite's own `server.fs` allow and deny rules, as `/@fs` applies them.
          isServable: (path) =>
            isFileLoadingAllowed(server.config, normalizePath(path)),
        }),
    },
    {
      // Only the dev server's per-module sourcemaps can map the browser's
      // transformed positions.
      method: "POST",
      path: DEV_ERROR_STACK_ENDPOINT,
      handle: (_url, body) => handleDevErrorStackRequest(body, { lookup }),
    },
    {
      method: "POST",
      path: DEV_ERROR_TERMINAL_ENDPOINT,
      handle: async (_url, body) => ({
        status: (await forwarder.handle(body)).status,
        body: "{}",
      }),
    },
    {
      method: "GET",
      path: DEV_ERROR_CLIENT_ERRORS_ENDPOINT,
      handle: () =>
        Promise.resolve({
          status: 200,
          body: JSON.stringify({ errors: forwarder.read() }),
        }),
    },
  ];
}

/**
 * Registers every {@link createDevEndpoints} endpoint. Called ahead of the
 * @cloudflare/vite-plugin proxy, so these requests never reach the worker, and
 * each answers only a loopback host (#2007) on its own origin.
 */
export function serveDevEndpoints(server: ViteDevServer): void {
  for (const endpoint of createDevEndpoints(server)) {
    server.middlewares.use((req, res, next) => {
      const url = req.url ?? "";
      const methods =
        endpoint.method === "GET" ? ["GET", "HEAD"] : [endpoint.method];
      if (
        !methods.includes(req.method ?? "") ||
        new URL(url, "http://localhost").pathname !== endpoint.path ||
        !isTrustedDevHost(req.headers.host)
      ) {
        next();
        return;
      }
      // Vite's CORS middleware ran first; the dev client is same-origin.
      res.removeHeader("access-control-allow-origin");
      if (!isSameOriginDevRequest(req.headers)) {
        res.statusCode = 403;
        res.end();
        return;
      }
      if (endpoint.method === "POST" && !isJson(req.headers["content-type"])) {
        res.statusCode = 415;
        res.end();
        return;
      }
      const body = endpoint.method === "POST" ? readBody(req) : "";
      void Promise.resolve(body)
        .then((text) => endpoint.handle(url, text))
        .then((answer) => {
          res.statusCode = answer.status;
          if (answer.body === null) {
            res.end();
            return;
          }
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(answer.body);
        })
        .catch(() => {
          res.statusCode = 500;
          res.end();
        });
    });
  }
}

/**
 * Any page the developer has open can send these a request, so it must come
 * from the dev server's own origin, not only to its loopback host.
 */
function isSameOriginDevRequest(headers: IncomingHttpHeaders): boolean {
  const { host, origin } = headers;
  if (origin !== undefined) {
    return URL.canParse(origin) && new URL(origin).host === host?.toLowerCase();
  }
  // A no-cors GET carries no `Origin`. A request with neither header comes
  // from outside a browser.
  const site = headers["sec-fetch-site"];
  return site === undefined || site === "same-origin" || site === "none";
}

/**
 * Another origin can send this type only as a CORS request, which carries an
 * `Origin`.
 */
function isJson(contentType: string | undefined): boolean {
  const type = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  return type === "application/json";
}

/**
 * Bounded so a stray large POST to the dev server can't grow memory unchecked.
 */
const MAX_DEV_ERROR_BODY_BYTES = 1024 * 1024;
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    req.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_DEV_ERROR_BODY_BYTES) {
        req.destroy();
        reject(new Error("dev-error request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

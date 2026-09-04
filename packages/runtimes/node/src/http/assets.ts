import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import type { ReadStream } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AssetsBinding } from "plumix";

import { writeResponse } from "./bridge.js";

export interface AssetsLayerOptions {
  /** The built client directory, `dist/client`. */
  readonly root: string;
}

export interface AssetsLayer extends AssetsBinding {
  /**
   * Connect-style middleware for the entry's pre-handler layer: answers a
   * held GET or HEAD from disk and hands everything else to `next`.
   */
  readonly serve: (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => void;
}

/** Content types for what a Vite client build emits and a site's `public/` may add. */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
};

const IMMUTABLE = "public, max-age=31536000, immutable";

interface Held {
  readonly file: string;
  readonly headers: Readonly<Record<string, string>>;
}

function contentType(file: string): string {
  return (
    CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream"
  );
}

// Dotfiles are refused throughout the tree, `.well-known` aside: an `.env`
// dropped into `public/` must never become a URL.
function hidden(segments: readonly string[]): boolean {
  return segments.some(
    (segment) => segment.startsWith(".") && segment !== ".well-known",
  );
}

/**
 * The file a URL path names under the root, or `null` when the layer does not
 * hold it. A directory is held only through its trailing-slash form, which
 * names its `index.html` — the shape the admin shell is fetched by.
 */
async function locate(root: string, pathname: string): Promise<Held | null> {
  try {
    const decoded = decodeURI(pathname);
    const relative = decoded.endsWith("/") ? `${decoded}index.html` : decoded;
    if (hidden(relative.split("/"))) return null;
    const file = resolve(root, `.${relative}`);
    if (!file.startsWith(root + sep)) return null;
    const stats = await stat(file);
    if (!stats.isFile()) return null;
    return {
      file,
      headers: {
        "content-type": contentType(file),
        "content-length": String(stats.size),
        // Hashed build output lives under `/assets/`; nothing else is content
        // addressed, so nothing else may be cached forever.
        ...(relative.startsWith("/assets/")
          ? { "cache-control": IMMUTABLE }
          : {}),
      },
    };
  } catch {
    return null;
  }
}

// The file is opened before any header is decided: a stream that fails on
// its first read would otherwise have already sent `immutable` with a body it
// cannot deliver.
function open(file: string): Promise<ReadStream> {
  return new Promise((resolvePromise, reject) => {
    const stream = createReadStream(file);
    stream.once("open", () => resolvePromise(stream));
    stream.once("error", reject);
  });
}

async function respond(
  held: Held,
  method: string | undefined,
): Promise<Response> {
  if (method === "HEAD") return new Response(null, { headers: held.headers });
  let stream: ReadStream;
  try {
    stream = await open(held.file);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? new Response("Not Found", { status: 404 })
      : new Response("Internal Server Error", { status: 500 });
  }
  // Node types its web streams apart from the global ones; same objects.
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: held.headers,
  });
}

/**
 * The disk layer over the built client directory, in the `"404"` mode of the
 * assets contract: a path it does not hold is the handler's to answer.
 */
export function createAssetsLayer(options: AssetsLayerOptions): AssetsLayer {
  const root = resolve(options.root);
  return {
    serve: (req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        next();
        return;
      }
      const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      void locate(root, pathname).then((held) => {
        if (held === null) {
          next();
          return;
        }
        return respond(held, req.method)
          .then((response) => writeResponse(response, req, res))
          .catch(() => res.destroy());
      });
    },
    fetch: async (request) => {
      const held = await locate(root, new URL(request.url).pathname);
      if (held === null) return new Response("Not Found", { status: 404 });
      return respond(held, request.method);
    },
  };
}

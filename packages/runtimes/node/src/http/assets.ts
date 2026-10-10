import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import type { ReadStream } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AssetsBinding } from "plumix";
import { resolveAssetPath } from "plumix/runtime";

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

interface Held {
  readonly file: string;
  readonly headers: Readonly<Record<string, string>>;
}

/** A directory without its trailing slash is refused here. */
async function locate(root: string, pathname: string): Promise<Held | null> {
  const asset = resolveAssetPath(root, pathname);
  if (asset === null) return null;
  try {
    const stats = await stat(asset.file);
    if (!stats.isFile()) return null;
    return {
      file: asset.file,
      headers: { ...asset.headers, "content-length": String(stats.size) },
    };
  } catch {
    return null;
  }
}

/**
 * The file is opened before any header is decided: a stream that fails on
 * its first read would otherwise have already sent `immutable` with a body it
 * cannot deliver.
 */
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

import { resolve } from "node:path";
import type { AssetsBinding } from "plumix";
import { resolveAssetPath } from "plumix/runtime";

export interface AssetsLayerOptions {
  /** The built client directory, `dist/client`. */
  readonly root: string;
}

export interface AssetsLayer extends AssetsBinding {
  /**
   * The serve path's pre-handler layer: a held GET or HEAD answered from
   * disk, `null` for everything the handler answers instead.
   */
  readonly serve: (request: Request) => Promise<Response | null>;
}

/**
 * A held file as a response, or `null` when the layer does not hold it. The
 * shared rules decide what a decoded path may name; the disk decides whether
 * it is a file. Every call opens its own `Bun.file`: one caches its stat and
 * would go on reporting a deleted file as present.
 */
async function answer(
  root: string,
  request: Request,
): Promise<Response | null> {
  const asset = resolveAssetPath(root, new URL(request.url).pathname);
  if (asset === null) return null;
  const file = Bun.file(asset.file);
  let size: number;
  try {
    const stats = await file.stat();
    if (!stats.isFile()) return null;
    size = stats.size;
  } catch {
    return null;
  }
  const headers = { ...asset.headers, "content-length": String(size) };
  return new Response(request.method === "HEAD" ? null : file, { headers });
}

/**
 * The `Bun.file` layer over the built client directory, in the `"404"` mode
 * of the assets contract: a path it does not hold is the handler's to answer.
 * Bun's own `routes: { dir }` is not used — it matches the raw, encoded path,
 * and the rules would then live in two places.
 */
export function createAssetsLayer(options: AssetsLayerOptions): AssetsLayer {
  const root = resolve(options.root);
  return {
    serve: (request) =>
      request.method === "GET" || request.method === "HEAD"
        ? answer(root, request)
        : Promise.resolve(null),
    fetch: async (request) =>
      (await answer(root, request)) ??
      new Response("Not Found", { status: 404 }),
  };
}

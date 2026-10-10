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
 * A fresh `Bun.file` per call: one caches its stat and would keep reporting a
 * deleted file.
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
 * Not Bun's `routes: { dir }`: it matches the raw, encoded path, so the
 * shared path rules would live in two places.
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

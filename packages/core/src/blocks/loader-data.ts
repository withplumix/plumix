import type { LoaderResults, ResolvedBlockLoaders } from "./loaders.js";

/**
 * Lossy by design: only successful loaders are carried, and whatever
 * `JSON.stringify` can't carry is gone.
 */
export function serializeLoaderData(resolved: ResolvedBlockLoaders): string {
  const out: Record<string, Readonly<Record<string, unknown>>> = {};
  for (const [nodeId, data] of resolved) {
    if (data.error === null) out[nodeId] = data.loaders;
  }
  return JSON.stringify(out);
}

/** Parse the embedded loader-data map back into `ResolvedBlockLoaders`.
 *  Malformed / non-object input yields an empty map (the edit runtime then
 *  renders blocks without seeded data rather than crashing). */
export function parseLoaderData(json: string): ResolvedBlockLoaders {
  const map = new Map<string, { loaders: LoaderResults; error: null }>();
  if (json.trim() === "") return map;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return map;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return map;
  for (const [nodeId, loaders] of Object.entries(parsed)) {
    if (loaders && typeof loaders === "object") {
      map.set(nodeId, {
        loaders: loaders as Record<string, unknown>,
        error: null,
      });
    }
  }
  return map;
}

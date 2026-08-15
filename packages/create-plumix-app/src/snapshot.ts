import { readFile } from "node:fs/promises";

import type { CatalogContext } from "./catalog.js";
import type { Registry } from "./registry.js";
import { loadCatalogContext } from "./catalog.js";
import { ScaffoldError } from "./errors.js";
import { loadRegistry } from "./registry.js";

/**
 * Everything a scaffold run needs: the discovered registry (runtimes and
 * plugins, with runtime file content inlined) plus the catalog context that
 * resolves their dependency protocols. Assembled live from the workspace, or
 * baked at `prepack` and reloaded — either way the same shape, so scaffolded
 * output is identical. A serialized copy of this is the published snapshot.
 */
export interface ScaffoldSources {
  readonly registry: Registry;
  readonly ctx: CatalogContext;
}

export async function buildSnapshot(
  repoRoot: string,
): Promise<ScaffoldSources> {
  const [registry, ctx] = await Promise.all([
    loadRegistry(repoRoot),
    loadCatalogContext(repoRoot),
  ]);
  return { registry, ctx };
}

export function serializeSnapshot(sources: ScaffoldSources): string {
  return `${JSON.stringify(sources, null, 2)}\n`;
}

export async function loadSnapshot(path: string): Promise<ScaffoldSources> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as ScaffoldSources;
  } catch (cause) {
    throw ScaffoldError.snapshotMissing({ path, cause });
  }
}

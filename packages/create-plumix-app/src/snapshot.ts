import { readFile } from "node:fs/promises";

import type { CatalogContext } from "./catalog.js";
import type { Registry } from "./registry.js";
import { loadCatalogContext } from "./catalog.js";
import { ScaffoldError } from "./errors.js";
import { loadRegistry } from "./registry.js";

/**
 * A self-contained scaffold snapshot: the discovered registry (runtimes and
 * plugins, with runtime file content inlined) plus the catalog context that
 * resolves their dependency protocols. Baked at `prepack` so the published
 * CLI scaffolds without the monorepo — the same resolution path as a live
 * workspace run, just against baked data.
 */
export interface Snapshot {
  readonly catalogContext: CatalogContext;
  readonly registry: Registry;
}

export async function buildSnapshot(repoRoot: string): Promise<Snapshot> {
  const [registry, catalogContext] = await Promise.all([
    loadRegistry(repoRoot),
    loadCatalogContext(repoRoot),
  ]);
  return { catalogContext, registry };
}

export function serializeSnapshot(snapshot: Snapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

export async function loadSnapshot(path: string): Promise<Snapshot> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Snapshot;
  } catch (cause) {
    throw ScaffoldError.snapshotMissing({ path, cause });
  }
}

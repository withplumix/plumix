import type { Rolldown } from "vite";
import { assert } from "vitest";

type OutputChunk = Rolldown.OutputChunk;

/**
 * The entry chunk named `name` and every chunk it imports statically: what the
 * browser fetches before the entry runs.
 */
export function eagerChunks(
  chunks: readonly OutputChunk[],
  name: string,
): ReadonlySet<OutputChunk> {
  const byFile = new Map(chunks.map((c) => [c.fileName, c]));
  const entry = chunks.find((c) => c.isEntry && c.name === name);
  assert(
    entry,
    `no ${name} entry chunk; chunks: ${chunks.map((c) => c.name).join(", ")}`,
  );
  const seen = new Set<OutputChunk>();
  const queue = [entry];
  for (let chunk = queue.pop(); chunk; chunk = queue.pop()) {
    if (seen.has(chunk)) continue;
    seen.add(chunk);
    for (const file of chunk.imports) {
      const imported = byFile.get(file);
      if (imported) queue.push(imported);
    }
  }
  return seen;
}

/** The modules of {@link eagerChunks}. */
export function eagerModules(
  chunks: readonly OutputChunk[],
  name: string,
): readonly string[] {
  return [...eagerChunks(chunks, name)].flatMap((c) => c.moduleIds);
}

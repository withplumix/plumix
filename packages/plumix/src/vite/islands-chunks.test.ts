import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Rolldown } from "vite";
import { build } from "vite";
import { beforeAll, describe, expect, test } from "vitest";

import { plumixSourceResolver } from "@plumix/vitest-config/source-resolver";

const REACT_MODULE = /[\\/]node_modules[\\/](?:react|react-dom)[\\/]/;

type OutputChunk = Rolldown.OutputChunk;

/**
 * The entry chunk named `name` and every chunk it imports statically: what the
 * browser fetches before the entry runs.
 */
function eagerModules(
  chunks: readonly OutputChunk[],
  name: string,
): readonly string[] {
  const byFile = new Map(chunks.map((c) => [c.fileName, c]));
  const entry = chunks.find((c) => c.isEntry && c.name === name);
  if (!entry) {
    throw new Error(
      `no ${name} entry chunk; chunks: ${chunks.map((c) => c.name).join(", ")}`,
    );
  }
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
  return [...seen].flatMap((c) => c.moduleIds);
}

describe("the islands chunks", () => {
  let element: readonly string[];
  let renderer: readonly string[];

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "plumix-islands-chunks-"));
    writeFileSync(
      join(dir, "runtime.js"),
      `import "@plumix/core/blocks/island-runtime";\n`,
    );
    writeFileSync(
      join(dir, "renderer.js"),
      `export * from "@plumix/core/blocks/island-renderer";\n`,
    );

    const result = await build({
      root: dir,
      logLevel: "silent",
      configFile: false,
      plugins: [plumixSourceResolver()],
      // Without it the dev-only error overlay's lazy `import()` pulls React
      // DOM into a shared chunk, a build shape that never ships.
      define: {
        "process.env.NODE_ENV": '"production"',
        "process.env.PLUMIX_DEV": '""',
      },
      build: {
        write: false,
        rollupOptions: {
          // Without it the renderer tree-shakes to an empty chunk, which would
          // also pass the negative check.
          preserveEntrySignatures: "strict",
          input: {
            "plumix-islands-runtime": join(dir, "runtime.js"),
            "plumix-islands-renderer": join(dir, "renderer.js"),
          },
        },
      },
    }).finally(() => rmSync(dir, { recursive: true, force: true }));
    const outputs = (
      Array.isArray(result) ? result : [result]
    ) as readonly Rolldown.RolldownOutput[];
    const chunks = outputs.flatMap((o) =>
      o.output.filter((c): c is OutputChunk => c.type === "chunk"),
    );

    element = eagerModules(chunks, "plumix-islands-runtime");
    renderer = eagerModules(chunks, "plumix-islands-renderer");
  });

  test("the eager element chunk carries no React", () => {
    expect(element.filter((id) => REACT_MODULE.test(id))).toEqual([]);
  });

  test("the lazy renderer chunk carries React", () => {
    expect(renderer.some((id) => REACT_MODULE.test(id))).toBe(true);
  });
});

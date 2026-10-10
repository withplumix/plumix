import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import type { Rolldown } from "vite";
import { build } from "vite";
import { describe, expect, test } from "vitest";

// Core keeps its dev-only code out of production by writing the
// `process.env.PLUMIX_DEV` literal at every gate, which the plugin's `define`
// substitutes to `""` on build so the branch — and the modules only it
// reaches — tree-shakes out. A helper or an exported constant standing in for
// the literal does not fold across modules, and the dev code ships (#2620).
// This builds what a runtime adapter imports from core's built output (the app,
// the dispatcher, and the handler that builds each request's context) with
// both defines and checks which dev modules land in the chunks.

/** The gated dev modules, as paths under core's `dist/`. */
const GATED_DEV_MODULES = [
  "dev/history-routes.js",
  "dev/request-history/writer.js",
  "dev/debug-bar/consumer.js",
  "dev/debug-bar/component.js",
  "dev/debug-panels/core-panels.js",
  "dev/server/hints/core-hints.js",
  "dev/server/respond.js",
  "runtime/dev.js",
];

const require = createRequire(import.meta.url);
const coreEntry = realpathSync(require.resolve("@plumix/core"));
const coreDist = dirname(coreEntry);

async function bundledCoreModules(plumixDev: string): Promise<Set<string>> {
  const dir = mkdtempSync(join(tmpdir(), "plumix-dev-gate-"));
  const entry = join(dir, "entry.js");
  // Absolute-path import so core's own dependencies resolve from its
  // node_modules, not the temp dir.
  writeFileSync(
    entry,
    `export { buildApp, createPlumixDispatcher, createRuntimeHandler } from ${JSON.stringify(coreEntry)};\n`,
  );
  const result = await build({
    root: dir,
    logLevel: "silent",
    configFile: false,
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.PLUMIX_DEV": plumixDev,
    },
    build: { ssr: entry, write: false, minify: true },
  });
  const outputs = (
    Array.isArray(result) ? result : [result]
  ) as readonly Rolldown.RolldownOutput[];
  const modules = new Set<string>();
  for (const output of outputs) {
    for (const chunk of output.output) {
      if (chunk.type !== "chunk") continue;
      for (const id of chunk.moduleIds) {
        const path = relative(coreDist, id.split("?")[0] ?? id);
        modules.add(path.split(sep).join("/"));
      }
    }
  }
  return modules;
}

describe("the dev-server gate in a bundle of core", () => {
  test("a dev build (PLUMIX_DEV set) includes every gated dev module", async () => {
    const modules = await bundledCoreModules('"1"');
    expect(GATED_DEV_MODULES.filter((m) => !modules.has(m))).toEqual([]);
  });

  test("a production build (PLUMIX_DEV empty) includes no gated dev module", async () => {
    const modules = await bundledCoreModules('""');
    expect(GATED_DEV_MODULES.filter((m) => modules.has(m))).toEqual([]);
  });
});

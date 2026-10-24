import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Rolldown } from "vite";
import { build } from "vite";
import { describe, expect, test } from "vitest";

import { plumixSourceResolver } from "@plumix/vitest-config/source-resolver";

// Vite promises only the inline `process.env.PLUMIX_DEV` replacement; a helper
// or exported constant standing in for it folds only if Rolldown inlines it.

/** The gated dev modules, as paths under core's `src/`. */
const GATED_DEV_MODULES = [
  "dev/history-routes.tsx",
  "dev/request-history/writer.ts",
  "dev/routes.ts",
  "dev/debug-bar/consumer.ts",
  "dev/debug-bar/component.tsx",
  "dev/debug-panels/core-panels.ts",
  "dev/debug-panels/builtin/mail.tsx",
  "dev/mail/catcher.ts",
  "dev/mail/gallery.tsx",
  "dev/mail/path.ts",
  "dev/mail/routes.tsx",
  "dev/mail/store.ts",
  "dev/mail/viewer.tsx",
  "dev/server/hints/core-hints.ts",
  "dev/server/respond.ts",
  "mcp/error-tools.ts",
  "mcp/telemetry-tools.ts",
  "runtime/dev.ts",
];

const coreSrc = fileURLToPath(new URL("../../../core/src/", import.meta.url));

async function bundledCoreModules(plumixDev: string): Promise<Set<string>> {
  const dir = mkdtempSync(join(tmpdir(), "plumix-dev-gate-"));
  const entry = join(dir, "entry.js");
  writeFileSync(
    entry,
    `export { buildApp, createPlumixDispatcher, createRuntimeHandler } from "@plumix/core";\n`,
  );
  const result = await build({
    root: dir,
    logLevel: "silent",
    configFile: false,
    plugins: [plumixSourceResolver()],
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.PLUMIX_DEV": plumixDev,
    },
    build: { ssr: entry, write: false, minify: true },
  }).finally(() => rmSync(dir, { recursive: true, force: true }));
  const outputs = (
    Array.isArray(result) ? result : [result]
  ) as readonly Rolldown.RolldownOutput[];
  const modules = new Set<string>();
  for (const output of outputs) {
    for (const chunk of output.output) {
      if (chunk.type !== "chunk") continue;
      for (const id of chunk.moduleIds) {
        const path = relative(coreSrc, id.split("?")[0] ?? id);
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

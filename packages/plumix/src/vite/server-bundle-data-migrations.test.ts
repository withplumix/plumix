import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Rolldown } from "vite";
import { createBuilder } from "vite";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { plumixSourceResolver } from "@plumix/vitest-config/source-resolver";

import { serverEnvironment } from "./server-environment.js";

// A Node or Bun worker imports the config, which names the data-migration
// modules, and `applyBuiltMigrations`, which imports their bundle at start.

const PLUGIN_MIGRATION = "rename-the-beta-flag";
const SITE_MIGRATION = "backfill-the-reading-time";

describe("a server bundle of a site that declares data migrations", () => {
  let dir: string;
  let chunks: readonly Rolldown.OutputChunk[];
  let warnings: unknown[];

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "plumix-server-data-"));
    const plugin = join(dir, "node_modules/@acme/plugin-flags");
    mkdirSync(plugin, { recursive: true });
    writeFileSync(
      join(plugin, "package.json"),
      JSON.stringify({
        name: "@acme/plugin-flags",
        type: "module",
        exports: { "./data-migrations": "./data-migrations.js" },
      }),
    );
    writeFileSync(
      join(plugin, "data-migrations.js"),
      `export default [{ name: "${PLUGIN_MIGRATION}", up: async () => {} }];\n`,
    );
    writeFileSync(
      join(dir, "data-migrations.ts"),
      `export default [{ name: "${SITE_MIGRATION}", up: async () => {} }];\n`,
    );
    writeFileSync(
      join(dir, "config.ts"),
      `export default {
  plugins: [
    {
      id: "flags",
      setup: () => undefined,
      dataMigrations: "@acme/plugin-flags/data-migrations",
    },
  ],
  dataMigrations: "./data-migrations.ts",
};
`,
    );
    writeFileSync(
      join(dir, "worker.ts"),
      `import { applyBuiltMigrations } from "plumix/cli";
import config from "./config.ts";

export default { config, applyBuiltMigrations };
`,
    );

    warnings = [];
    vi.spyOn(console, "warn").mockImplementation((...args) => {
      warnings.push(args);
    });
    const builder = await createBuilder({
      configFile: false,
      root: dir,
      logLevel: "warn",
      plugins: [plumixSourceResolver()],
      environments: {
        server: serverEnvironment({ entry: "worker.ts", outDir: "dist" }),
      },
    });
    const environment = builder.environments.server;
    if (environment === undefined) throw new Error("no server environment");
    environment.config.build.write = false;
    const result = (await builder.build(environment)) as
      Rolldown.RolldownOutput | Rolldown.RolldownOutput[];
    chunks = (Array.isArray(result) ? result : [result]).flatMap((output) =>
      output.output.filter(
        (chunk): chunk is Rolldown.OutputChunk => chunk.type === "chunk",
      ),
    );
    vi.restoreAllMocks();
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("no chunk includes a data-migration module", () => {
    expect(chunks.map((chunk) => chunk.fileName)).toContain("worker.js");
    // Core's own list travels with the runner; the site's and the plugin's
    // modules are the only ones under the site's directory besides these two.
    expect(
      chunks
        .flatMap((chunk) => chunk.moduleIds)
        .filter((id) => id.startsWith(dir))
        .sort(),
    ).toEqual([join(dir, "config.ts"), join(dir, "worker.ts")]);
  });

  test("no chunk carries a data migration's name", () => {
    expect(
      chunks.filter(
        (chunk) =>
          chunk.code.includes(PLUGIN_MIGRATION) ||
          chunk.code.includes(SITE_MIGRATION),
      ),
    ).toEqual([]);
  });

  test("the start-time import of the data bundle builds without a warning", () => {
    expect(warnings).toEqual([]);
  });
});

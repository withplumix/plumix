import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { PlumixConfig } from "@plumix/core";

import { buildDataMigrations } from "./data-migrations-bundle.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "plumix-data-bundle-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "site" }));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/** A module whose migrations are named `names`, importing nothing. */
const migrations = (...names: string[]) =>
  `export default ${JSON.stringify(names)}.map((name) => ({ name, up: async () => {} }));\n`;

/** A plugin package with no tables: no `schemaModule`, only data migrations. */
function installPlugin(name: string, source: string): void {
  const root = join(dir, "node_modules", name);
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name,
      type: "module",
      exports: { "./data-migrations": "./data-migrations.js" },
    }),
  );
  writeFileSync(join(root, "data-migrations.js"), source);
}

function site(config: Partial<PlumixConfig>) {
  return {
    cwd: dir,
    configPath: join(dir, "plumix.config.ts"),
    config: { plugins: [], ...config } as unknown as PlumixConfig,
  };
}

const SERVER = { entry: ".plumix/worker.ts", outDir: "dist/server" };

async function built(): Promise<unknown> {
  const file = join(dir, "dist/server/migrations/data-migrations.js");
  const module = (await import(pathToFileURL(file).href)) as {
    default: { owner: string; migrations: { name: string }[] }[];
  };
  return module.default.map(({ owner, migrations }) => ({
    owner,
    names: migrations.map(({ name }) => name),
  }));
}

describe("the data-migrations bundle a build ships beside the server", () => {
  const pluginAndSiteMigrations = () => {
    installPlugin("@acme/plugin-flags", migrations("rename-beta", "backfill"));
    writeFileSync(join(dir, "data-migrations.ts"), migrations("seed"));
    return site({
      plugins: [
        {
          id: "flags",
          setup: () => undefined,
          dataMigrations: "@acme/plugin-flags/data-migrations",
        },
      ],
      dataMigrations: "./data-migrations.ts",
    });
  };

  test("lists the plugin's and the site's data migrations under their owners, in run order", async () => {
    await buildDataMigrations(pluginAndSiteMigrations(), SERVER);

    expect(await built()).toEqual([
      { owner: "@acme/plugin-flags", names: ["rename-beta", "backfill"] },
      { owner: "site", names: ["seed"] },
    ]);
  });

  test("builds the plugin's and the site's data migrations without printing anything", async () => {
    const warn = vi.spyOn(console, "warn");
    const log = vi.spyOn(console, "log");

    await buildDataMigrations(pluginAndSiteMigrations(), SERVER);

    expect([...warn.mock.calls, ...log.mock.calls]).toEqual([]);
  });

  test('a migration importing a module that declares "use client", as core\'s blocks do, builds without a warning', async () => {
    writeFileSync(
      join(dir, "facade.ts"),
      `"use client";\nexport const name = "from-a-client-module";\n`,
    );
    writeFileSync(
      join(dir, "data-migrations.ts"),
      `import { name } from "./facade.ts";\nexport default [{ name, up: async () => {} }];\n`,
    );
    const warn = vi.spyOn(console, "warn");

    await buildDataMigrations(
      site({ dataMigrations: "./data-migrations.ts" }),
      SERVER,
    );

    expect(await built()).toEqual([
      { owner: "site", names: ["from-a-client-module"] },
    ]);
    expect(warn.mock.calls).toEqual([]);
  });

  test("a site that declares none still gets the file, with an empty list", async () => {
    await buildDataMigrations(site({}), SERVER);

    expect(await built()).toEqual([]);
  });
});

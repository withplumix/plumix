import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import type { PlumixConfig } from "@plumix/core";

import { resolveDataMigrationModules } from "./data-modules.js";

let site: string;

beforeEach(() => {
  site = mkdtempSync(join(tmpdir(), "plumix-data-modules-"));
  writeFileSync(join(site, "package.json"), JSON.stringify({ name: "site" }));
});

afterEach(() => {
  rmSync(site, { recursive: true, force: true });
});

function siteWith(dataMigrations: string): PlumixConfig {
  return {
    plugins: [{ id: "local", setup: () => undefined, dataMigrations }],
  } as unknown as PlumixConfig;
}

describe("resolveDataMigrationModules", () => {
  test("resolves a plugin's relative dataMigrations from the folder holding plumix.config.ts", () => {
    mkdirSync(join(site, "src"));
    writeFileSync(join(site, "src/data.ts"), "export default [];\n");

    const modules = resolveDataMigrationModules(
      site,
      join(site, "plumix.config.ts"),
      siteWith("./src/data"),
    );

    expect(modules).toEqual([
      { owner: "site", files: [join(site, "src/data.ts")] },
    ]);
  });

  test("refuses a plugin's relative dataMigrations that names no file, with the path it tried", () => {
    const act = () =>
      resolveDataMigrationModules(
        site,
        join(site, "plumix.config.ts"),
        siteWith("./src/data"),
      );

    expect(act).toThrow(
      expect.objectContaining({
        code: "migrate_data_module_unresolved",
        cause: `${join(site, "src/data")} does not exist`,
        hint: expect.stringContaining(
          "resolve from the folder holding plumix.config.ts",
        ) as unknown,
      }),
    );
  });
});

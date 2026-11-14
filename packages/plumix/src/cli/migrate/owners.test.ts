import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import type { PlumixConfig } from "@plumix/core";

import { resolveOwners } from "./owners.js";

let site: string;

beforeEach(() => {
  site = mkdtempSync(join(tmpdir(), "plumix-owners-"));
  writeFileSync(join(site, "package.json"), JSON.stringify({ name: "site" }));
});

afterEach(() => {
  rmSync(site, { recursive: true, force: true });
});

function siteWith(schemaModule: string): PlumixConfig {
  return {
    plugins: [{ id: "local", setup: () => undefined, schemaModule }],
  } as unknown as PlumixConfig;
}

function write(path: string, content: string): void {
  mkdirSync(join(site, path, ".."), { recursive: true });
  writeFileSync(join(site, path), content);
}

describe("resolveOwners", () => {
  test("resolves a relative schemaModule from the folder holding plumix.config.ts", () => {
    write("vendor/widgets/package.json", '{"name":"@acme/widgets"}');
    write("vendor/widgets/schema.ts", "export {};\n");
    mkdirSync(join(site, "vendor/widgets/migrations"));

    const owners = resolveOwners(
      site,
      join(site, "plumix.config.ts"),
      siteWith("./vendor/widgets/schema"),
    );

    expect(owners.map((owner) => owner.name)).toEqual([
      "core",
      "@acme/widgets",
    ]);
  });

  test("refuses a relative schemaModule that names no file, with the path it tried", () => {
    const act = () =>
      resolveOwners(
        site,
        join(site, "plumix.config.ts"),
        siteWith("./src/schema"),
      );

    expect(act).toThrow(
      expect.objectContaining({
        code: "migrate_schema_module_unresolved",
        cause: `${join(site, "src/schema")} does not exist`,
        hint: expect.stringContaining(
          "resolve from the folder holding plumix.config.ts",
        ) as unknown,
      }),
    );
  });
});

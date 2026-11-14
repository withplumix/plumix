import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import type { AnyPluginDescriptor } from "../config.js";
import { CORE_MIGRATIONS } from "./harness.js";
import { migrationFolders } from "./site-migrations.js";

let site: string;

beforeEach(() => {
  site = mkdtempSync(join(tmpdir(), "plumix-site-migrations-"));
  writeFileSync(join(site, "package.json"), '{"name":"site"}');
  mkdirSync(join(site, "migrations"));
});

afterEach(() => {
  rmSync(site, { recursive: true, force: true });
});

function write(path: string, content: string): void {
  mkdirSync(join(site, path, ".."), { recursive: true });
  writeFileSync(join(site, path), content);
}

function local(schemaModule: string): AnyPluginDescriptor {
  return { id: "local", setup: () => undefined, schemaModule };
}

describe("migrationFolders", () => {
  test("applies the site's own history for a relative schemaModule inside it", () => {
    write("src/schema.ts", "export {};\n");

    expect(migrationFolders(site, [local("./src/schema")])).toEqual([
      CORE_MIGRATIONS,
      join(site, "migrations"),
    ]);
  });

  test("applies the history of the package a relative schemaModule lands in", () => {
    write("vendor/widgets/package.json", '{"name":"@acme/widgets"}');
    write("vendor/widgets/schema.ts", "export {};\n");
    mkdirSync(join(site, "vendor/widgets/migrations"));

    expect(migrationFolders(site, [local("./vendor/widgets/schema")])).toEqual([
      CORE_MIGRATIONS,
      join(site, "vendor/widgets/migrations"),
    ]);
  });

  test("refuses a relative schemaModule that names no file, with the path it tried", () => {
    expect(() => migrationFolders(site, [local("./src/schema")])).toThrow(
      join(site, "src/schema"),
    );
  });
});

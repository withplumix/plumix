import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { spawnCapturingStderr } from "@plumix/core";

import { migrateGenerateDeps } from "../src/cli/commands/migrate.js";

/**
 * `migrate generate` reads failure off drizzle-kit's stderr, because
 * drizzle-kit catches its own errors and exits 0 regardless. That only
 * works while a *successful* generate stays silent on stderr — a
 * property of the pinned version, not a documented contract. These run
 * the real binary so a `catalog:drizzle` bump breaks here rather than in
 * every build in the repo.
 */
describe("drizzle-kit's stderr contract", () => {
  let dir: string;

  const SCHEMA = `
    import { sqliteTable } from "drizzle-orm/sqlite-core";

    export const widgets = sqliteTable("widgets", (t) => ({
      id: t.integer().primaryKey({ autoIncrement: true }),
      name: t.text().notNull(),
    }));
  `;

  function generate(): Promise<string> {
    const bin = migrateGenerateDeps.resolveDrizzleKitBin(dir);
    if (bin === null) throw new Error("drizzle-kit did not resolve");
    return spawnCapturingStderr(
      process.execPath,
      [
        "--no-warnings",
        bin,
        "generate",
        "--schema",
        "schema.ts",
        "--dialect",
        "sqlite",
        "--out",
        "drizzle",
        "--casing",
        "snake_case",
      ],
      { cwd: dir, env: { NODE_OPTIONS: undefined, NODE_DEBUG: undefined } },
    );
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plumix-drizzle-contract-"));
    writeFileSync(join(dir, "schema.ts"), SCHEMA, "utf8");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // Each `generate` spawns drizzle-kit, which bundles the schema with
  // esbuild before it can diff — past vitest's 5s default on a cold
  // runner, so both carry their own budget.
  const SPAWNS_DRIZZLE_KIT = 60_000;

  test(
    "a generate that writes a migration says nothing on stderr",
    async () => {
      await expect(generate()).resolves.toBe("");
    },
    SPAWNS_DRIZZLE_KIT,
  );

  test(
    "a generate with nothing to do says nothing on stderr",
    async () => {
      await generate();

      await expect(generate()).resolves.toBe("");
    },
    SPAWNS_DRIZZLE_KIT,
  );
});

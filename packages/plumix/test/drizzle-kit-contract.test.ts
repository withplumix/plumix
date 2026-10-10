import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import type { CommandContext, PlumixApp } from "@plumix/core";
import { spawnCapturingStderr } from "@plumix/core";
import { createDispatcherHarness } from "@plumix/core/test";

import {
  migrateCommand,
  migrateGenerateDeps,
} from "../src/cli/commands/migrate.js";
import { report } from "../src/cli/report.js";

/**
 * `migrate generate` leans on two properties of the pinned drizzle-kit that
 * are not documented contracts: a successful generate stays silent on
 * stderr, and one that needs a rename decided fails without a terminal.
 * These run the real binary so a `catalog:drizzle` bump breaks here rather
 * than in every build in the repo.
 */

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

function makeProjectDir(): void {
  dir = mkdtempSync(join(tmpdir(), "plumix-drizzle-contract-"));
  writeFileSync(join(dir, "schema.ts"), SCHEMA, "utf8");
}

/**
 * Each `generate` spawns drizzle-kit, which bundles the schema with esbuild
 * before it can diff — past vitest's 5s default on a cold runner, so every
 * spawning test or hook carries its own budget.
 */
const ONE_SPAWN = 60_000;
const TWO_SPAWNS = 120_000;

describe("drizzle-kit's stderr contract", () => {
  beforeEach(makeProjectDir);

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test(
    "a generate that writes a migration says nothing on stderr",
    async () => {
      await expect(generate()).resolves.toBe("");
    },
    ONE_SPAWN,
  );

  test(
    "a generate with nothing to do says nothing on stderr",
    async () => {
      await generate();

      await expect(generate()).resolves.toBe("");
    },
    TWO_SPAWNS,
  );
});

describe("plumix migrate generate on a site's own tables", () => {
  let site: string;
  let base: PlumixApp;

  // A local plugin's schema module: its table references core's `entries`,
  // imported (as a site imports `plumix/schema`) but not re-exported.
  const CORE_STUB = `
    import { sqliteTable } from "drizzle-orm/sqlite-core";

    export const entries = sqliteTable("entries", (t) => ({
      id: t.integer().primaryKey({ autoIncrement: true }),
    }));
  `;
  const BOOKMARKS = `
    import { sqliteTable } from "drizzle-orm/sqlite-core";
    import { entries } from "./core-stub";

    export const bookmarks = sqliteTable("bookmarks", (t) => ({
      id: t.integer().primaryKey({ autoIncrement: true }),
      entryId: t.integer().notNull().references(() => entries.id),
    }));
  `;

  function generateCtx(): CommandContext {
    return {
      app: {
        ...base,
        config: {
          ...base.config,
          plugins: [
            {
              id: "bookmarks",
              setup: () => undefined,
              schemaModule: "../src/schema.ts",
            },
          ],
        },
      },
      cwd: site,
      configPath: join(site, "plumix.config.ts"),
      argv: ["generate"],
    };
  }

  const migrationsDir = () => join(site, "migrations");
  const sqlFiles = () =>
    readdirSync(migrationsDir()).filter((file) => file.endsWith(".sql"));

  beforeAll(async () => {
    ({ app: base } = await createDispatcherHarness());
  });

  beforeEach(() => {
    site = mkdtempSync(join(tmpdir(), "plumix-site-generate-"));
    writeFileSync(join(site, "package.json"), JSON.stringify({ name: "site" }));
    mkdirSync(join(site, "src"));
    writeFileSync(join(site, "src/core-stub.ts"), CORE_STUB, "utf8");
    writeFileSync(join(site, "src/schema.ts"), BOOKMARKS, "utf8");
    // The command's own progress lines; what these tests read is on disk.
    vi.spyOn(report, "info").mockImplementation(() => undefined);
    vi.spyOn(report, "success").mockImplementation(() => undefined);
  });

  afterEach(() => {
    rmSync(site, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  test(
    "writes a history of only the site's table, with its foreign key, and a second run writes nothing",
    async () => {
      await migrateCommand.run(generateCtx());

      const [file] = sqlFiles();
      const sql = readFileSync(join(migrationsDir(), file ?? ""), "utf8");
      expect(sqlFiles()).toHaveLength(1);
      expect(sql.match(/CREATE TABLE `(\w+)`/g)).toEqual([
        "CREATE TABLE `bookmarks`",
      ]);
      expect(sql).toContain(
        "FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`)",
      );

      await migrateCommand.run(generateCtx());

      expect(sqlFiles()).toEqual([file]);
    },
    TWO_SPAWNS,
  );

  test(
    "a rename it cannot ask about without a terminal fails, advising a terminal rather than any deletion",
    async () => {
      await migrateCommand.run(generateCtx());
      const before = sqlFiles();
      writeFileSync(
        join(site, "src/schema.ts"),
        BOOKMARKS.replace("entryId:", "postId:"),
        "utf8",
      );
      // The child's stderr is forwarded to ours, so the reason is on screen.
      const stderr = vi
        .spyOn(process.stderr, "write")
        .mockImplementation(() => true);

      const failure = migrateCommand.run(generateCtx());

      await expect(failure).rejects.toMatchObject({
        code: "migrate_generate_failed",
        hint: expect.stringContaining(
          "run `plumix migrate generate` in an interactive terminal",
        ) as unknown,
      });
      await expect(failure).rejects.toMatchObject({
        hint: expect.not.stringMatching(/delet|remov|rm /i) as unknown,
      });
      expect(sqlFiles()).toEqual(before);
      expect(
        stderr.mock.calls.map(([chunk]) => String(chunk)).join(""),
      ).toMatch(/Interactive prompts require a TTY/);
    },
    TWO_SPAWNS,
  );
});

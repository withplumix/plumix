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
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type {
  CommandContext,
  CommandDefinition,
  PlumixApp,
} from "@plumix/core";

import { migrateCommand, migrateGenerateDeps } from "./migrate.js";

function fakeApp(plugins: readonly unknown[] = []): PlumixApp {
  return {
    config: {
      runtime: { name: "test", buildFetchHandler: () => () => new Response() },
      database: { kind: "test", connect: () => ({ db: {} }) },
      auth: {
        kind: "plumix",
        passkey: { rpName: "x", rpId: "localhost", origin: "http://x" },
      },
      plugins,
    },
  } as unknown as PlumixApp;
}

function ctx(overrides: Partial<CommandContext>): CommandContext {
  return {
    app: fakeApp(),
    cwd: process.cwd(),
    configPath: join(process.cwd(), "plumix.config.ts"),
    argv: [],
    runtimeMigrate: {},
    ...overrides,
  };
}

describe("migrate dispatch", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plumix-migrate-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  test("apply delegates to runtimeMigrate.apply with the remaining argv", async () => {
    const apply = vi.fn<(c: CommandContext) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const runtimeApply: CommandDefinition = { describe: "apply", run: apply };

    await migrateCommand.run(
      ctx({
        cwd: dir,
        argv: ["apply", "my-db", "--remote"],
        runtimeMigrate: { apply: runtimeApply },
      }),
    );

    expect(apply).toHaveBeenCalledOnce();
    expect(apply.mock.calls[0]?.[0].argv).toEqual(["my-db", "--remote"]);
  });

  test("unknown subcommand surfaces the available list in the hint", async () => {
    await expect(
      migrateCommand.run(
        ctx({
          cwd: dir,
          argv: ["nope"],
          runtimeMigrate: {
            apply: { describe: "apply", run: () => undefined },
          },
        }),
      ),
    ).rejects.toMatchObject({
      code: "unknown_subcommand",
      hint: expect.stringContaining("plumix migrate apply") as unknown,
    });
  });

  test("inherited prototype names fall through to unknown_subcommand", async () => {
    for (const sub of ["__proto__", "constructor", "toString"]) {
      await expect(
        migrateCommand.run(ctx({ cwd: dir, argv: [sub] })),
      ).rejects.toMatchObject({ code: "unknown_subcommand" });
    }
  });
});

describe("migrate generate", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plumix-migrate-gen-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  test("writes .plumix/schema.ts, then spawns drizzle-kit generate", async () => {
    vi.spyOn(migrateGenerateDeps, "resolveDrizzleKitBin").mockReturnValue(
      "/fake/drizzle-kit/bin.cjs",
    );
    const spawn = vi
      .spyOn(migrateGenerateDeps, "spawnCapturingStderr")
      .mockResolvedValue("");

    await migrateCommand.run(ctx({ cwd: dir, argv: ["generate"] }));

    const schema = readFileSync(join(dir, ".plumix/schema.ts"), "utf8");
    expect(schema).toContain("export");

    expect(spawn).toHaveBeenCalledOnce();
    const [command, args, options] = spawn.mock.calls[0] ?? [];
    expect(command).toBe(process.execPath);
    expect(args).toEqual([
      "--no-warnings",
      "/fake/drizzle-kit/bin.cjs",
      "generate",
      "--schema",
      ".plumix/schema.ts",
      "--dialect",
      "sqlite",
      "--out",
      "drizzle",
      "--casing",
      "snake_case",
    ]);
    // NODE_OPTIONS / NODE_DEBUG are stripped so nothing inherited writes
    // to the stderr this command reads failure from.
    expect(options).toEqual({
      cwd: dir,
      env: { NODE_OPTIONS: undefined, NODE_DEBUG: undefined },
    });
  });

  test("defaulting to the generate subcommand (no argv) behaves the same", async () => {
    vi.spyOn(migrateGenerateDeps, "resolveDrizzleKitBin").mockReturnValue(
      "/fake/drizzle-kit/bin.cjs",
    );
    const spawn = vi
      .spyOn(migrateGenerateDeps, "spawnCapturingStderr")
      .mockResolvedValue("");

    await migrateCommand.run(ctx({ cwd: dir, argv: [] }));
    expect(spawn).toHaveBeenCalledOnce();
  });

  test("throws a structured CliError when drizzle-kit is not installed", async () => {
    vi.spyOn(migrateGenerateDeps, "resolveDrizzleKitBin").mockReturnValue(null);
    const spawn = vi
      .spyOn(migrateGenerateDeps, "spawnCapturingStderr")
      .mockResolvedValue("");

    await expect(
      migrateCommand.run(ctx({ cwd: dir, argv: ["generate"] })),
    ).rejects.toMatchObject({
      code: "migrate_generate_no_drizzle_kit",
      hint: expect.stringContaining("ships with plumix") as unknown,
    });
    expect(spawn).not.toHaveBeenCalled();
  });

  test("fails when drizzle-kit reports an error but exits zero", async () => {
    vi.spyOn(migrateGenerateDeps, "resolveDrizzleKitBin").mockReturnValue(
      "/fake/drizzle-kit/bin.cjs",
    );
    vi.spyOn(migrateGenerateDeps, "spawnCapturingStderr").mockResolvedValue(
      "Error: Interactive prompts require a TTY terminal\n",
    );

    await expect(
      migrateCommand.run(ctx({ cwd: dir, argv: ["generate"] })),
    ).rejects.toMatchObject({
      code: "migrate_generate_failed",
      hint: expect.stringContaining("`drizzle/`") as unknown,
    });
  });

  test("propagates a non-zero exit from drizzle-kit", async () => {
    vi.spyOn(migrateGenerateDeps, "resolveDrizzleKitBin").mockReturnValue(
      "/fake/drizzle-kit/bin.cjs",
    );
    vi.spyOn(migrateGenerateDeps, "spawnCapturingStderr").mockRejectedValue(
      Object.assign(new Error("drizzle-kit exited with code 1"), {
        code: "spawn_nonzero_exit",
      }),
    );

    await expect(
      migrateCommand.run(ctx({ cwd: dir, argv: ["generate"] })),
    ).rejects.toMatchObject({ code: "spawn_nonzero_exit" });
  });
});

describe("resolveDrizzleKitBin", () => {
  test("falls back to plumix's bundled drizzle-kit when cwd has none", () => {
    const empty = mkdtempSync(join(tmpdir(), "plumix-empty-"));
    try {
      const bin = migrateGenerateDeps.resolveDrizzleKitBin(empty);
      expect(bin).not.toBeNull();
      expect(bin).toMatch(/drizzle-kit\/bin\.cjs$/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("migrate generate with plugin-contributed raw SQL", () => {
  let dir: string;

  const FTS_SQL = "CREATE VIRTUAL TABLE entry_fts USING fts5(body)";

  const SEARCH_PLUGIN = {
    id: "search",
    setup: () => undefined,
    sqlMigrations: [{ name: "fts_index", statements: [FTS_SQL] }],
  };

  function seedDrizzleJournal(): void {
    mkdirSync(join(dir, "drizzle/meta"), { recursive: true });
    writeFileSync(
      join(dir, "drizzle/meta/_journal.json"),
      JSON.stringify({
        version: "7",
        dialect: "sqlite",
        entries: [
          {
            idx: 0,
            version: "6",
            when: 1,
            tag: "0000_plain_phil_sheldon",
            breakpoints: true,
          },
        ],
      }),
      "utf8",
    );
  }

  function readJournalTags(): readonly string[] {
    const journal = JSON.parse(
      readFileSync(join(dir, "drizzle/meta/_journal.json"), "utf8"),
    ) as { entries: { tag: string }[] };
    return journal.entries.map((entry) => entry.tag);
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plumix-migrate-raw-"));
    vi.spyOn(migrateGenerateDeps, "resolveDrizzleKitBin").mockReturnValue(
      "/fake/drizzle-kit/bin.cjs",
    );
    vi.spyOn(migrateGenerateDeps, "spawnCapturingStderr").mockResolvedValue("");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  test("emits the migration after the schema diff and journals it", async () => {
    seedDrizzleJournal();

    await migrateCommand.run(
      ctx({ cwd: dir, argv: ["generate"], app: fakeApp([SEARCH_PLUGIN]) }),
    );

    expect(
      readFileSync(
        join(dir, "drizzle/0001_plumix_search_fts_index.sql"),
        "utf8",
      ),
    ).toBe(`${FTS_SQL};\n`);
    expect(readJournalTags()).toEqual([
      "0000_plain_phil_sheldon",
      "0001_plumix_search_fts_index",
    ]);
  });

  test("a second generate does not re-emit what the journal carries", async () => {
    seedDrizzleJournal();
    const run = () =>
      migrateCommand.run(
        ctx({ cwd: dir, argv: ["generate"], app: fakeApp([SEARCH_PLUGIN]) }),
      );

    await run();
    await run();

    expect(readJournalTags()).toEqual([
      "0000_plain_phil_sheldon",
      "0001_plumix_search_fts_index",
    ]);
  });

  test("a config with no raw migrations leaves the journal untouched", async () => {
    seedDrizzleJournal();
    const before = readFileSync(
      join(dir, "drizzle/meta/_journal.json"),
      "utf8",
    );

    await migrateCommand.run(ctx({ cwd: dir, argv: ["generate"] }));

    expect(readFileSync(join(dir, "drizzle/meta/_journal.json"), "utf8")).toBe(
      before,
    );
    expect(readdirSync(join(dir, "drizzle"))).toEqual(["meta"]);
  });

  test("surfaces a structured error when the journal is unreadable", async () => {
    mkdirSync(join(dir, "drizzle/meta"), { recursive: true });
    writeFileSync(
      join(dir, "drizzle/meta/_journal.json"),
      "{ not json",
      "utf8",
    );

    await expect(
      migrateCommand.run(
        ctx({ cwd: dir, argv: ["generate"], app: fakeApp([SEARCH_PLUGIN]) }),
      ),
    ).rejects.toMatchObject({ code: "migrate_generate_journal_unreadable" });
  });
});

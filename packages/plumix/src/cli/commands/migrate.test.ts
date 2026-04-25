import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type {
  CommandContext,
  CommandDefinition,
  PlumixApp,
} from "@plumix/core";

import { migrateCommand, migrateGenerateDeps } from "./migrate.js";

function fakeApp(): PlumixApp {
  return {
    config: {
      runtime: { name: "test", buildFetchHandler: () => () => new Response() },
      database: { kind: "test", connect: () => ({ db: {} }) },
      auth: {
        kind: "plumix",
        passkey: { rpName: "x", rpId: "localhost", origin: "http://x" },
      },
      themes: [],
      plugins: [],
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
      code: "UNKNOWN_SUBCOMMAND",
      hint: expect.stringContaining("plumix migrate apply") as unknown,
    });
  });

  test("inherited prototype names fall through to UNKNOWN_SUBCOMMAND", async () => {
    for (const sub of ["__proto__", "constructor", "toString"]) {
      await expect(
        migrateCommand.run(ctx({ cwd: dir, argv: [sub] })),
      ).rejects.toMatchObject({ code: "UNKNOWN_SUBCOMMAND" });
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
      .spyOn(migrateGenerateDeps, "spawnInherit")
      .mockResolvedValue();

    await migrateCommand.run(ctx({ cwd: dir, argv: ["generate"] }));

    const schema = readFileSync(join(dir, ".plumix/schema.ts"), "utf8");
    expect(schema).toContain("export");

    expect(spawn).toHaveBeenCalledOnce();
    const [command, args, options] = spawn.mock.calls[0] ?? [];
    expect(command).toBe(process.execPath);
    expect(args).toEqual([
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
    expect(options).toEqual({ cwd: dir });
  });

  test("defaulting to the generate subcommand (no argv) behaves the same", async () => {
    vi.spyOn(migrateGenerateDeps, "resolveDrizzleKitBin").mockReturnValue(
      "/fake/drizzle-kit/bin.cjs",
    );
    const spawn = vi
      .spyOn(migrateGenerateDeps, "spawnInherit")
      .mockResolvedValue();

    await migrateCommand.run(ctx({ cwd: dir, argv: [] }));
    expect(spawn).toHaveBeenCalledOnce();
  });

  test("throws a structured CliError when drizzle-kit is not installed", async () => {
    vi.spyOn(migrateGenerateDeps, "resolveDrizzleKitBin").mockReturnValue(null);
    const spawn = vi
      .spyOn(migrateGenerateDeps, "spawnInherit")
      .mockResolvedValue();

    await expect(
      migrateCommand.run(ctx({ cwd: dir, argv: ["generate"] })),
    ).rejects.toMatchObject({
      code: "MIGRATE_GENERATE_NO_DRIZZLE_KIT",
      hint: expect.stringContaining("ships with plumix") as unknown,
    });
    expect(spawn).not.toHaveBeenCalled();
  });

  test("propagates a non-zero exit from drizzle-kit", async () => {
    vi.spyOn(migrateGenerateDeps, "resolveDrizzleKitBin").mockReturnValue(
      "/fake/drizzle-kit/bin.cjs",
    );
    vi.spyOn(migrateGenerateDeps, "spawnInherit").mockRejectedValue(
      Object.assign(new Error("drizzle-kit exited with code 1"), {
        code: "SPAWN_NONZERO_EXIT",
      }),
    );

    await expect(
      migrateCommand.run(ctx({ cwd: dir, argv: ["generate"] })),
    ).rejects.toMatchObject({ code: "SPAWN_NONZERO_EXIT" });
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

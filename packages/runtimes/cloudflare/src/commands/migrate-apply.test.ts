import type { CommandContext, PlumixApp } from "plumix";
import { afterEach, describe, expect, test, vi } from "vitest";

import { migrateApplyCommand, migrateApplyDeps } from "./migrate-apply.js";

function ctx(overrides: Partial<CommandContext>): CommandContext {
  return {
    app: {} as unknown as PlumixApp,
    cwd: "/tmp/fake",
    configPath: "/tmp/fake/plumix.config.ts",
    argv: [],
    runtimeMigrate: {},
    ...overrides,
  };
}

describe("migrate apply", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("uses an explicit positional db name and passes flags through", async () => {
    const spawn = vi
      .spyOn(migrateApplyDeps, "spawnInherit")
      .mockResolvedValue();
    vi.spyOn(migrateApplyDeps, "loadWranglerConfig").mockReturnValue(null);

    await migrateApplyCommand.run(
      ctx({ argv: ["my-db", "--remote", "--preview"] }),
    );

    expect(spawn).toHaveBeenCalledOnce();
    const [command, args] = spawn.mock.calls[0] ?? [];
    expect(command).toBe("wrangler");
    expect(args).toEqual([
      "d1",
      "migrations",
      "apply",
      "my-db",
      "--remote",
      "--preview",
    ]);
  });

  test("auto-discovers a single D1 db from wrangler config", async () => {
    const spawn = vi
      .spyOn(migrateApplyDeps, "spawnInherit")
      .mockResolvedValue();
    vi.spyOn(migrateApplyDeps, "loadWranglerConfig").mockReturnValue({
      filename: "wrangler.jsonc",
      d1Databases: [{ binding: "DB", database_name: "only-db" }],
    });

    await migrateApplyCommand.run(ctx({ argv: ["--remote"] }));

    const [, args] = spawn.mock.calls[0] ?? [];
    expect(args).toEqual(["d1", "migrations", "apply", "only-db", "--remote"]);
  });

  test("auto-discovers when called with no args", async () => {
    const spawn = vi
      .spyOn(migrateApplyDeps, "spawnInherit")
      .mockResolvedValue();
    vi.spyOn(migrateApplyDeps, "loadWranglerConfig").mockReturnValue({
      filename: "wrangler.toml",
      d1Databases: [{ binding: "DB", database_name: "only-db" }],
    });

    await migrateApplyCommand.run(ctx({ argv: [] }));

    const [, args] = spawn.mock.calls[0] ?? [];
    expect(args).toEqual(["d1", "migrations", "apply", "only-db"]);
  });

  test("throws MIGRATE_APPLY_MISSING_DB when no name and no wrangler config", async () => {
    vi.spyOn(migrateApplyDeps, "spawnInherit").mockResolvedValue();
    vi.spyOn(migrateApplyDeps, "loadWranglerConfig").mockReturnValue(null);

    await expect(
      migrateApplyCommand.run(ctx({ argv: [] })),
    ).rejects.toMatchObject({
      code: "MIGRATE_APPLY_MISSING_DB",
      hint: expect.stringContaining("wrangler.jsonc") as unknown,
    });
  });

  test("throws MIGRATE_APPLY_NO_D1 when config has no d1_databases", async () => {
    vi.spyOn(migrateApplyDeps, "spawnInherit").mockResolvedValue();
    vi.spyOn(migrateApplyDeps, "loadWranglerConfig").mockReturnValue({
      filename: "wrangler.jsonc",
      d1Databases: [],
    });

    await expect(
      migrateApplyCommand.run(ctx({ argv: [] })),
    ).rejects.toMatchObject({ code: "MIGRATE_APPLY_NO_D1" });
  });

  test("throws MIGRATE_APPLY_AMBIGUOUS_DB when config has multiple D1 dbs", async () => {
    vi.spyOn(migrateApplyDeps, "spawnInherit").mockResolvedValue();
    vi.spyOn(migrateApplyDeps, "loadWranglerConfig").mockReturnValue({
      filename: "wrangler.jsonc",
      d1Databases: [
        { binding: "A", database_name: "alpha" },
        { binding: "B", database_name: "beta" },
      ],
    });

    await expect(
      migrateApplyCommand.run(ctx({ argv: [] })),
    ).rejects.toMatchObject({
      code: "MIGRATE_APPLY_AMBIGUOUS_DB",
      message: expect.stringContaining("alpha") as unknown,
    });
  });
});

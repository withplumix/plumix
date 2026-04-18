import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type {
  CommandContext,
  CommandDefinition,
  PlumixApp,
} from "@plumix/core";

import { migrateCommand } from "./migrate.js";

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

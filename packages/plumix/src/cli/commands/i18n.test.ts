import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { CommandContext, PlumixApp } from "@plumix/core";

import { i18nCommand, i18nDeps } from "./i18n.js";

function fakeApp(): PlumixApp {
  return {
    config: {
      runtime: { name: "test", buildFetchHandler: () => () => new Response() },
      database: { kind: "test", connect: () => ({ db: {} }) },
      plugins: [],
    },
  } as unknown as PlumixApp;
}

function ctx(
  overrides: Partial<CommandContext> & { cwd: string },
): CommandContext {
  return {
    app: fakeApp(),
    configPath: join(overrides.cwd, "plumix.config.ts"),
    argv: [],
    runtimeMigrate: {},
    ...overrides,
  };
}

describe("i18nCommand", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plumix-i18n-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "test" }));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  test("rejects an unknown subcommand with the supported list", async () => {
    await expect(
      i18nCommand.run(ctx({ cwd: dir, argv: ["coverage"] })),
    ).rejects.toThrow(/Unknown subcommand: i18n coverage/);
  });

  test("rejects a missing subcommand with a clear marker", async () => {
    await expect(i18nCommand.run(ctx({ cwd: dir, argv: [] }))).rejects.toThrow(
      /Unknown subcommand: i18n \(missing\)/,
    );
  });

  test("spawns the resolved lingui binary with subcommand + forwarded args", async () => {
    vi.spyOn(i18nDeps, "resolveLinguiCliBin").mockReturnValue(
      "/fake/lingui.js",
    );
    const spawn = vi
      .spyOn(i18nDeps, "spawnInherit")
      .mockResolvedValue(undefined);

    await i18nCommand.run(ctx({ cwd: dir, argv: ["extract", "--clean"] }));

    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      ["/fake/lingui.js", "extract", "--clean"],
      { cwd: dir },
    );
  });

  test("errors when @lingui/cli isn't resolvable", async () => {
    vi.spyOn(i18nDeps, "resolveLinguiCliBin").mockReturnValue(null);
    await expect(
      i18nCommand.run(ctx({ cwd: dir, argv: ["extract"] })),
    ).rejects.toThrow(/@lingui\/cli not found/);
  });
});

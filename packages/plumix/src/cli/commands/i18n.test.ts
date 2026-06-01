import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

  describe("extract --check", () => {
    test("throws + restores .po contents when extract drifted the file", async () => {
      const localesDir = join(dir, "locales");
      mkdirSync(localesDir, { recursive: true });
      const enPo = join(localesDir, "en.po");
      const before = 'msgid ""\nmsgstr "header"\n';
      writeFileSync(enPo, before);

      vi.spyOn(i18nDeps, "resolveLinguiCliBin").mockReturnValue(
        "/fake/lingui.js",
      );
      vi.spyOn(i18nDeps, "spawnInherit").mockImplementation(() => {
        writeFileSync(enPo, before + '\nmsgid "new.string"\nmsgstr ""\n');
        return Promise.resolve();
      });

      await expect(
        i18nCommand.run(ctx({ cwd: dir, argv: ["extract", "--check"] })),
      ).rejects.toThrow(/drift|out of sync/i);

      // Working tree must be clean after a failed --check so CI doesn't
      // surface unstaged changes from the gate itself.
      expect(readFileSync(enPo, "utf8")).toBe(before);
    });

    test("detects new msgids folded across continuation lines (>80 chars)", async () => {
      const localesDir = join(dir, "locales");
      mkdirSync(localesDir, { recursive: true });
      const enPo = join(localesDir, "en.po");
      const before = 'msgid ""\nmsgstr "header"\n';
      writeFileSync(enPo, before);

      vi.spyOn(i18nDeps, "resolveLinguiCliBin").mockReturnValue(
        "/fake/lingui.js",
      );
      // pofile-ts folds long msgids: emit one with the same continuation
      // shape lingui produces (`msgid ""` followed by `"..."` lines).
      vi.spyOn(i18nDeps, "spawnInherit").mockImplementation(() => {
        writeFileSync(
          enPo,
          before +
            '\nmsgid ""\n"block.variations.cover.hero.split-layout."\n"with-tall-image.fullwidth"\nmsgstr ""\n',
        );
        return Promise.resolve();
      });

      await expect(
        i18nCommand.run(ctx({ cwd: dir, argv: ["extract", "--check"] })),
      ).rejects.toThrow(
        /block\.variations\.cover\.hero\.split-layout\.with-tall-image\.fullwidth/,
      );
    });

    test("forwards `--clean` so source-side deletions surface as drift", async () => {
      const localesDir = join(dir, "locales");
      mkdirSync(localesDir, { recursive: true });
      const enPo = join(localesDir, "en.po");
      // Catalog starts with `removed.in.source` active. Extract with
      // --clean would demote it to `#~` obsolete (msgid no longer in
      // source); `activeMsgids` filters obsoletes, so the gate sees
      // the id as removed.
      writeFileSync(
        enPo,
        'msgid ""\nmsgstr "header"\n\nmsgid "removed.in.source"\nmsgstr ""\n',
      );

      vi.spyOn(i18nDeps, "resolveLinguiCliBin").mockReturnValue(
        "/fake/lingui.js",
      );
      const spawn = vi
        .spyOn(i18nDeps, "spawnInherit")
        .mockImplementation(() => {
          // Simulate lingui --clean output: msgid demoted to obsolete.
          writeFileSync(
            enPo,
            'msgid ""\nmsgstr "header"\n\n#~ msgid "removed.in.source"\n#~ msgstr ""\n',
          );
          return Promise.resolve();
        });

      await expect(
        i18nCommand.run(ctx({ cwd: dir, argv: ["extract", "--check"] })),
      ).rejects.toThrow(/- removed\.in\.source/);

      // Verify `--clean` was forwarded to lingui.
      expect(spawn).toHaveBeenCalledWith(
        process.execPath,
        ["/fake/lingui.js", "extract", "--clean"],
        { cwd: dir },
      );
    });

    test("treats a new .po written by extract as drift and cleans it up", async () => {
      const localesDir = join(dir, "locales");
      mkdirSync(localesDir, { recursive: true });
      const dePo = join(localesDir, "de.po");

      vi.spyOn(i18nDeps, "resolveLinguiCliBin").mockReturnValue(
        "/fake/lingui.js",
      );
      vi.spyOn(i18nDeps, "spawnInherit").mockImplementation(() => {
        writeFileSync(
          dePo,
          'msgid ""\nmsgstr "header"\n\nmsgid "freshly.added"\nmsgstr ""\n',
        );
        return Promise.resolve();
      });

      await expect(
        i18nCommand.run(ctx({ cwd: dir, argv: ["extract", "--check"] })),
      ).rejects.toThrow(/drift|out of sync/i);

      // New file must be removed so the gate doesn't leave it staged in CI.
      expect(existsSync(dePo)).toBe(false);
    });

    test("strips `--check` and forwards `--clean` to lingui", async () => {
      const localesDir = join(dir, "locales");
      mkdirSync(localesDir, { recursive: true });
      writeFileSync(join(localesDir, "en.po"), 'msgid ""\nmsgstr "header"\n');

      vi.spyOn(i18nDeps, "resolveLinguiCliBin").mockReturnValue(
        "/fake/lingui.js",
      );
      const spawn = vi
        .spyOn(i18nDeps, "spawnInherit")
        .mockResolvedValue(undefined);

      await i18nCommand.run(ctx({ cwd: dir, argv: ["extract", "--check"] }));

      // `--check` is plumix's own flag (never reaches lingui). `--clean`
      // is forwarded so source-side deletions count as drift.
      expect(spawn).toHaveBeenCalledWith(
        process.execPath,
        ["/fake/lingui.js", "extract", "--clean"],
        { cwd: dir },
      );
    });
  });
});

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

import {
  computeIdDrift,
  i18nCommand,
  i18nDeps,
  LINGUI_DEP_RANGE,
  sourceDescriptorIds,
} from "./i18n.js";

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

describe("sourceDescriptorIds", () => {
  test("finds an id in a plain object literal that also has message", () => {
    const ids = sourceDescriptorIds(
      'const M = { foo: { id: "plugin.blog.post.singular", message: "Post" } };',
    );
    expect([...ids]).toEqual(["plugin.blog.post.singular"]);
  });

  test("finds an id inside withContext({ id, message }, ctx)", () => {
    const ids = sourceDescriptorIds(
      'const POST = withContext({ id: "plugin.blog.post.singular", message: "Post" }, "post type singular name");',
    );
    expect([...ids]).toEqual(["plugin.blog.post.singular"]);
  });

  test("finds an id inside defineMessage({...}) spanning multiple lines", () => {
    const ids = sourceDescriptorIds(
      `defineMessage({
         id: "entries.list.row.trash",
         message: "Trash",
         context: "action verb",
       })`,
    );
    expect([...ids]).toEqual(["entries.list.row.trash"]);
  });

  test("ignores object literals that have id but no message", () => {
    // e.g. <Trans id="x" /> as a runtime ref, or { id: 1 } DB record
    const ids = sourceDescriptorIds('const ref = { id: "some.id" };');
    expect([...ids]).toEqual([]);
  });

  test('finds an id in a <Trans id="..." message="..." /> JSX element', () => {
    const ids = sourceDescriptorIds(
      `<Trans id="plugin.auditLog.column.actor" message="Actor" />`,
    );
    expect([...ids]).toEqual(["plugin.auditLog.column.actor"]);
  });

  test("finds an id in a multiline <Trans> tag", () => {
    const ids = sourceDescriptorIds(
      `<Trans
         id="entries.list.statusFilter.draft"
         message="Draft"
         context="entry status"
       />`,
    );
    expect([...ids]).toEqual(["entries.list.statusFilter.draft"]);
  });

  test("does NOT match an outer { id: ... } whose message: lives in a nested child block", () => {
    // Real false positive: a nav-group descriptor `{ id: "library",
    // label: { id: "...", message: "Library" } }` has both keys but
    // `message:` belongs to a nested object, so the outer `id:` is not
    // a translation descriptor.
    const ids = sourceDescriptorIds(`{
       id: "library",
       label: { id: "core.adminNav.library", message: "Library" },
       priority: 150,
     }`);
    expect([...ids]).toEqual(["core.adminNav.library"]);
  });

  test("collects every descriptor in a file (no duplicates)", () => {
    const ids = sourceDescriptorIds(
      `const A = { id: "a.x", message: "A" };
       const B = { id: "b.y", message: "B" };
       const C = { id: "a.x", message: "duplicate" };`,
    );
    expect([...ids].sort()).toEqual(["a.x", "b.y"]);
  });
});

describe("computeIdDrift", () => {
  test("returns empty arrays when source and catalog ids match exactly", () => {
    const drift = computeIdDrift(new Set(["a.x", "b.y"]), ["a.x", "b.y"]);
    expect(drift).toEqual({ missingInCatalog: [], orphanedInCatalog: [] });
  });

  test("flags an id declared in source but absent from the catalog", () => {
    const drift = computeIdDrift(new Set(["a.x", "b.y"]), ["a.x"]);
    expect(drift).toEqual({
      missingInCatalog: ["b.y"],
      orphanedInCatalog: [],
    });
  });

  test("flags a msgid in the catalog with no source declaration", () => {
    const drift = computeIdDrift(new Set(["a.x"]), ["a.x", "b.y"]);
    expect(drift).toEqual({
      missingInCatalog: [],
      orphanedInCatalog: ["b.y"],
    });
  });

  test("sorts both lists for stable CI output", () => {
    const drift = computeIdDrift(new Set(["c", "a"]), ["d", "b"]);
    expect(drift).toEqual({
      missingInCatalog: ["a", "c"],
      orphanedInCatalog: ["b", "d"],
    });
  });
});

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

  describe("verify", () => {
    function seedPlugin(args: {
      readonly sourceIds: readonly string[];
      readonly catalogIds: readonly string[];
    }): void {
      const localesDir = join(dir, "locales");
      const srcDir = join(dir, "src");
      mkdirSync(localesDir, { recursive: true });
      mkdirSync(srcDir, { recursive: true });
      const src = args.sourceIds
        .map(
          (id) =>
            `const _${id.replace(/\W/g, "_")} = { id: "${id}", message: "msg" };`,
        )
        .join("\n");
      writeFileSync(join(srcDir, "index.ts"), src);
      const po = `msgid ""\nmsgstr ""\n\n${args.catalogIds
        .map((id) => `msgid "${id}"\nmsgstr ""`)
        .join("\n\n")}\n`;
      writeFileSync(join(localesDir, "en.po"), po);
    }

    test("passes silently when source ids and catalog msgids match", async () => {
      seedPlugin({
        sourceIds: ["plugin.x.foo", "plugin.x.bar"],
        catalogIds: ["plugin.x.foo", "plugin.x.bar"],
      });
      await expect(
        i18nCommand.run(ctx({ cwd: dir, argv: ["verify"] })),
      ).resolves.toBeUndefined();
    });

    test("throws a drift error listing ids missing from the catalog", async () => {
      seedPlugin({
        sourceIds: ["plugin.x.foo", "plugin.x.bar"],
        catalogIds: ["plugin.x.foo"],
      });
      await expect(
        i18nCommand.run(ctx({ cwd: dir, argv: ["verify"] })),
      ).rejects.toThrow(/plugin\.x\.bar/);
    });

    test("throws on orphaned msgids in the catalog with no source declaration", async () => {
      seedPlugin({
        sourceIds: ["plugin.x.foo"],
        catalogIds: ["plugin.x.foo", "plugin.x.dead"],
      });
      await expect(
        i18nCommand.run(ctx({ cwd: dir, argv: ["verify"] })),
      ).rejects.toThrow(/plugin\.x\.dead/);
    });
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

  describe("init", () => {
    interface PartialPackageJson {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    }
    const readPkg = (cwd: string): PartialPackageJson =>
      JSON.parse(
        readFileSync(join(cwd, "package.json"), "utf8"),
      ) as PartialPackageJson;

    beforeEach(() => {
      // `report.info` writes to stdout; silence it in tests.
      vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    });

    test("scaffolds lingui.config.ts at the package root", async () => {
      await i18nCommand.run(ctx({ cwd: dir, argv: ["init"] }));
      const configPath = join(dir, "lingui.config.ts");
      expect(existsSync(configPath)).toBe(true);
      const config = readFileSync(configPath, "utf8");
      expect(config).toContain('sourceLocale: "en"');
      expect(config).toContain('path: "<rootDir>/locales/{locale}"');
      expect(config).toContain('include: ["src"]');
      expect(config).toContain("formatter({ lineNumbers: false })");
    });

    test("scaffolds scripts/i18n-compile-check.mjs with the parse-error gate", async () => {
      await i18nCommand.run(ctx({ cwd: dir, argv: ["init"] }));
      const scriptPath = join(dir, "scripts", "i18n-compile-check.mjs");
      expect(existsSync(scriptPath)).toBe(true);
      const script = readFileSync(scriptPath, "utf8");
      // Same contract as admin's: spawn `lingui compile` without
      // `--strict` (the args array literally doesn't include it),
      // grep stdout for "Compilation error", exit 1 on parse error.
      expect(script).toMatch(/spawn\([\s\S]*"lingui",\s*"compile"/);
      expect(script).not.toMatch(/"--strict"/);
      expect(script).toMatch(/Compilation error/);
    });

    test("patches package.json with i18n scripts pinned to LINGUI_DEP_RANGE", async () => {
      await i18nCommand.run(ctx({ cwd: dir, argv: ["init"] }));
      const pkg = readPkg(dir);
      expect(pkg.scripts).toMatchObject({
        "i18n:extract": "lingui extract",
        "i18n:compile": "lingui compile --namespace es",
        "i18n:check": "plumix i18n verify",
      });
      // Pinning to the constant — a version bump must be a deliberate
      // test change so the gate against silent drift stays loud.
      expect(pkg.devDependencies?.["@lingui/cli"]).toBe(LINGUI_DEP_RANGE);
      expect(pkg.devDependencies?.["@lingui/format-po"]).toBe(LINGUI_DEP_RANGE);
    });

    test("re-running init preserves user edits to scaffolded files", async () => {
      await i18nCommand.run(ctx({ cwd: dir, argv: ["init"] }));
      const scriptBefore = readFileSync(
        join(dir, "scripts", "i18n-compile-check.mjs"),
        "utf8",
      );
      const pkgBefore = readFileSync(join(dir, "package.json"), "utf8");

      // Mutate the scaffolded files; re-running init must not clobber.
      writeFileSync(join(dir, "lingui.config.ts"), "// user edit\n");

      await i18nCommand.run(ctx({ cwd: dir, argv: ["init"] }));

      expect(readFileSync(join(dir, "lingui.config.ts"), "utf8")).toBe(
        "// user edit\n",
      );
      // The other targets were already in place, so they stay identical.
      expect(
        readFileSync(join(dir, "scripts", "i18n-compile-check.mjs"), "utf8"),
      ).toBe(scriptBefore);
      expect(readFileSync(join(dir, "package.json"), "utf8")).toBe(pkgBefore);
    });

    test("preserves user scripts and devDeps when patching package.json", async () => {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify(
          {
            name: "test",
            scripts: { build: "tsc", test: "vitest" },
            devDependencies: { typescript: "^5" },
          },
          null,
          2,
        ),
      );

      await i18nCommand.run(ctx({ cwd: dir, argv: ["init"] }));

      const pkg = readPkg(dir);
      expect(pkg.scripts?.build).toBe("tsc");
      expect(pkg.scripts?.test).toBe("vitest");
      expect(pkg.devDependencies?.typescript).toBe("^5");
      expect(pkg.scripts?.["i18n:extract"]).toBe("lingui extract");
      expect(pkg.devDependencies?.["@lingui/cli"]).toBe(LINGUI_DEP_RANGE);
    });

    test("user values win on collision — never overwrite a customized script", async () => {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify(
          {
            name: "test",
            scripts: { "i18n:extract": "my-custom-extract" },
            devDependencies: { "@lingui/cli": "5.0.0" },
          },
          null,
          2,
        ),
      );

      await i18nCommand.run(ctx({ cwd: dir, argv: ["init"] }));

      const pkg = readPkg(dir);
      expect(pkg.scripts?.["i18n:extract"]).toBe("my-custom-extract");
      expect(pkg.devDependencies?.["@lingui/cli"]).toBe("5.0.0");
    });

    test("errors clearly when package.json is missing", async () => {
      rmSync(join(dir, "package.json"));
      await expect(
        i18nCommand.run(ctx({ cwd: dir, argv: ["init"] })),
      ).rejects.toThrow(/No package\.json at /);
      // Other targets still landed before the package.json step — that's
      // fine; re-running after `pnpm init` completes the scaffold.
    });

    test("refuses to overwrite a malformed package.json", async () => {
      writeFileSync(join(dir, "package.json"), "{ not valid json");
      await expect(
        i18nCommand.run(ctx({ cwd: dir, argv: ["init"] })),
      ).rejects.toThrow(/Cannot parse package\.json/);
      // The broken file is left untouched for the user to fix.
      expect(readFileSync(join(dir, "package.json"), "utf8")).toBe(
        "{ not valid json",
      );
    });
  });
});

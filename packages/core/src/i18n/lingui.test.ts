import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeConfig } from "@lingui/conf";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { compileCatalogs } from "../../i18n-compile/index.mjs";
import { defineLinguiConfig } from "./lingui.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "plumix-lingui-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function shipCatalogs(locales: readonly string[]): void {
  for (const locale of locales) {
    writeFileSync(join(dir, `${locale}.po`), 'msgid ""\nmsgstr ""\n');
  }
}

describe("defineLinguiConfig", () => {
  test("fills zh-Hant from no other catalog, as CLDR parents it on root", () => {
    shipCatalogs(["en", "zh", "zh-Hant"]);
    const config = makeConfig(
      defineLinguiConfig({
        rootDir: dir,
        surfaces: [{ catalogPath: "<rootDir>/{locale}", include: ["src"] }],
      }),
    );

    expect(config.fallbackLocales).toMatchObject({ "zh-Hant": [] });
  });
});

describe("a package compiled through defineLinguiConfig", () => {
  // Runs the real `lingui compile`: a cold Lingui start costs 1–3s.
  const COMPILE_TIMEOUT = 20_000;
  const linguiBin = join(
    dirname(createRequire(import.meta.url).resolve("@lingui/cli")),
    "lingui.js",
  );
  const helper = fileURLToPath(new URL("./lingui.ts", import.meta.url));

  function seedPackage(
    catalogs: Readonly<Record<string, Readonly<Record<string, string>>>>,
  ): void {
    writeFileSync(
      join(dir, "lingui.config.ts"),
      `import { defineLinguiConfig } from ${JSON.stringify(helper)};\n\nexport default defineLinguiConfig({ rootDir: import.meta.dirname });\n`,
    );
    mkdirSync(join(dir, "locales"));
    for (const [locale, messages] of Object.entries(catalogs)) {
      const entries = Object.entries(messages).map(
        ([id, msgstr]) => `msgid "${id}"\nmsgstr "${msgstr}"\n`,
      );
      writeFileSync(
        join(dir, "locales", `${locale}.po`),
        `msgid ""\nmsgstr ""\n\n${entries.join("\n")}`,
      );
    }
  }

  async function compiledMessages(locale: string): Promise<unknown[]> {
    const { messages } = (await import(
      pathToFileURL(join(dir, "locales", `${locale}.mjs`)).href
    )) as { messages: Record<string, unknown> };
    // Lingui keys a compiled message by a hash of its msgid.
    return Object.values(messages);
  }

  beforeEach(() => {
    // Lingui loads a worker file it doesn't publish when the spawned process
    // sees vitest's `NODE_ENV=test`.
    vi.stubEnv("NODE_ENV", "production");
    // Lingui's own progress output.
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  test(
    "gives a partial de-AT the de translation of every message it lacks",
    async () => {
      seedPackage({
        en: { save: "Save", cancel: "Cancel" },
        de: { save: "Speichern", cancel: "Abbrechen" },
        "de-AT": { save: "Sichern", cancel: "" },
      });

      const result = await compileCatalogs({ cwd: dir, linguiBin });

      expect(result).toEqual({ ok: true });
      expect((await compiledMessages("de-AT")).sort()).toEqual([
        ["Abbrechen"],
        ["Sichern"],
      ]);
    },
    COMPILE_TIMEOUT,
  );

  test(
    "fails on zh_CN.po with the name to rename it to",
    async () => {
      seedPackage({ en: { save: "Save" }, zh_CN: { save: "保存" } });

      const result = await compileCatalogs({ cwd: dir, linguiBin });

      expect(result).toEqual({
        ok: false,
        reason: "rename `zh_CN.po` to `zh-CN.po`",
      });
    },
    COMPILE_TIMEOUT,
  );
});

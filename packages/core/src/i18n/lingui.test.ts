import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getCatalogs } from "@lingui/cli/api";
import { makeConfig } from "@lingui/conf";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

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

  test("fills a partial de-AT from de and no other locale", () => {
    shipCatalogs(["en", "de", "de-AT"]);
    const config = makeConfig(
      defineLinguiConfig({
        rootDir: dir,
        surfaces: [{ catalogPath: "<rootDir>/{locale}", include: ["src"] }],
      }),
    );

    expect(config.fallbackLocales).toEqual({
      en: [],
      de: [],
      "de-AT": ["de"],
    });
  });

  test("loads a misnamed catalog and leaves it unfilled", () => {
    shipCatalogs(["en", "zh_CN"]);
    const config = makeConfig(
      defineLinguiConfig({
        rootDir: dir,
        surfaces: [{ catalogPath: "<rootDir>/{locale}", include: ["src"] }],
      }),
    );

    expect(config.fallbackLocales).toEqual({ en: [], zh_CN: [] });
  });

  test("scans src for a package that names no surface", () => {
    const config = makeConfig(defineLinguiConfig({ rootDir: dir }));

    expect(config.catalogs.map(({ include }) => include)).toEqual([["src"]]);
  });

  test("scans the dirs each surface names", () => {
    const config = makeConfig(
      defineLinguiConfig({
        rootDir: dir,
        surfaces: [
          { catalogPath: "<rootDir>/mail-{locale}", include: ["src/mail"] },
        ],
      }),
    );

    expect(config.catalogs.map(({ include }) => include)).toEqual([
      ["src/mail"],
    ]);
  });

  // A line number in a reference rewrites the `.po` on every extract that
  // moves a line, so the diff carries no translation work.
  test("writes a message's source file without its line number", async () => {
    const { format } = defineLinguiConfig({ rootDir: dir });

    const po = await format?.serialize(
      { save: { message: "Save", origin: [["src/editor.ts", 12]] } },
      {
        locale: "en",
        sourceLocale: "en",
        filename: "en.po",
        existing: undefined,
      },
    );

    expect(po).toContain("#: src/editor.ts\n");
  });
});

describe("a package compiled through defineLinguiConfig", () => {
  function seedPackage(
    catalogs: Readonly<Record<string, Readonly<Record<string, string>>>>,
  ): void {
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

  async function compiledMessages(locale: string): Promise<string[]> {
    const config = makeConfig({
      ...defineLinguiConfig({ rootDir: dir }),
      rootDir: dir,
    });
    const [catalog] = await getCatalogs(config);
    if (catalog === undefined) throw new Error("no catalog configured");
    const { messages } = await catalog.getTranslations(locale, {
      sourceLocale: config.sourceLocale,
      fallbackLocales: config.fallbackLocales,
    });
    return Object.values(messages);
  }

  test("gives a partial de-AT the de translation of every message it lacks", async () => {
    seedPackage({
      en: { save: "Save", cancel: "Cancel" },
      de: { save: "Speichern", cancel: "Abbrechen" },
      "de-AT": { save: "Sichern", cancel: "" },
    });

    expect((await compiledMessages("de-AT")).sort()).toEqual([
      "Abbrechen",
      "Sichern",
    ]);
  });
});

import { describe, expect, test } from "vitest";

import type { CatalogIndex } from "./lazy-catalogs.js";
import { lazyCatalogs } from "./lazy-catalogs.js";

/** An index whose loaders record each locale they import. */
function countingIndex(
  catalogs: Readonly<Record<string, Readonly<Record<string, string>>>>,
): { readonly index: CatalogIndex; readonly imported: string[] } {
  const imported: string[] = [];
  const index = Object.fromEntries(
    Object.entries(catalogs).map(([locale, messages]) => [
      locale,
      () => {
        imported.push(locale);
        return Promise.resolve({ messages });
      },
    ]),
  );
  return { index, imported };
}

describe("lazyCatalogs", () => {
  test("imports a locale's catalog on its first use only", async () => {
    const { index, imported } = countingIndex({
      en: { greeting: "Hello" },
      de: { greeting: "Hallo" },
    });
    const catalogs = lazyCatalogs(index);
    expect(imported).toEqual([]);

    await Promise.all([catalogs.load("de"), catalogs.load("de")]);
    expect(await catalogs.load("de")).toEqual({ greeting: "Hallo" });
    expect(imported).toEqual(["de"]);
  });

  test("names the shipped locales without importing a catalog", () => {
    const { index, imported } = countingIndex({ en: {}, "zh-CN": {} });
    expect(lazyCatalogs(index).locales).toEqual(["en", "zh-CN"]);
    expect(imported).toEqual([]);
  });

  test("reads a locale with no catalog as empty", async () => {
    expect(await lazyCatalogs({}).load("fr")).toEqual({});
  });

  test("reads a loaded catalog synchronously, and nothing before its load", async () => {
    const { index } = countingIndex({ de: { greeting: "Hallo" } });
    const catalogs = lazyCatalogs(index);
    expect(catalogs.loaded("de")).toEqual({});

    await catalogs.load("de");
    expect(catalogs.loaded("de")).toEqual({ greeting: "Hallo" });
  });
});

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { PLUMIX_LOCALES } from "@plumix/lingui-config";

import { listAdminAreas } from "./i18n.js";

const LOCALES_DIR = fileURLToPath(new URL("../../locales", import.meta.url));

describe("listAdminAreas", () => {
  test("ships an admin-area catalog for every PLUMIX_LOCALES locale", () => {
    const poLocales = readdirSync(LOCALES_DIR)
      .filter((f) => f.startsWith("admin-area-") && f.endsWith(".po"))
      .map((f) => f.replace(/^admin-area-/, "").replace(/\.po$/, ""))
      .sort();
    expect(poLocales).toEqual([...PLUMIX_LOCALES].sort());
  });

  test("names each area in English when the visitor states no language", () => {
    expect(
      listAdminAreas(
        [
          "apiTokens",
          "deviceAuthorization",
          "passkeys",
          "oauthLinking",
          "emailDelivery",
        ],
        null,
      ),
    ).toBe(
      "API tokens, Device sign-in, Passkeys, OAuth sign-in, and Email delivery",
    );
  });

  // Unit tests read an empty stand-in for the compiled catalogs, so the
  // labels stay English here; the list's own grammar shows the locale chosen.
  test("formats the list in the first shipped locale the visitor accepts", () => {
    expect(
      listAdminAreas(["apiTokens", "passkeys"], "fr-FR, de-AT;q=0.8, en;q=0.5"),
    ).toBe("API tokens und Passkeys");
  });

  test.each(["zh-TW", "zh-HK"])(
    "names the areas in English for %s rather than in Simplified Chinese",
    (acceptLanguage) => {
      expect(listAdminAreas(["apiTokens", "passkeys"], acceptLanguage)).toBe(
        "API tokens and Passkeys",
      );
    },
  );

  test("formats the list in German for an Austrian visitor", () => {
    expect(listAdminAreas(["apiTokens", "passkeys"], "de-AT, en;q=0.5")).toBe(
      "API tokens und Passkeys",
    );
  });

  test("keeps English for a visitor who accepts English first", () => {
    expect(listAdminAreas(["apiTokens", "passkeys"], "en-US, de;q=0.5")).toBe(
      "API tokens and Passkeys",
    );
  });

  test("moves past an entry whose CLDR chain ends at root without a catalog", () => {
    expect(listAdminAreas(["apiTokens", "passkeys"], "sr-Latn, de")).toBe(
      "API tokens und Passkeys",
    );
  });

  test("skips an entry that is not a language tag", () => {
    expect(listAdminAreas(["apiTokens", "passkeys"], "*, de")).toBe(
      "API tokens und Passkeys",
    );
  });

  test("falls back to English when no accepted locale is shipped", () => {
    expect(listAdminAreas(["apiTokens", "passkeys"], "fr-FR")).toBe(
      "API tokens and Passkeys",
    );
  });
});

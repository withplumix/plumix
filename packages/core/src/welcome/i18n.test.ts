import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { PLUMIX_LOCALES } from "@plumix/lingui-config";

import { welcomeMessages } from "./i18n.js";

const LOCALES_DIR = fileURLToPath(new URL("../../locales", import.meta.url));

describe("welcome catalogs", () => {
  test("ships a welcome catalog for every PLUMIX_LOCALES locale", () => {
    // A locale added to the shared config without a welcome catalog would
    // silently fall back to English — fail loud here instead.
    const poLocales = readdirSync(LOCALES_DIR)
      .filter((f) => f.startsWith("welcome-") && f.endsWith(".po"))
      .map((f) => f.replace(/^welcome-/, "").replace(/\.po$/, ""))
      .sort();
    expect(poLocales).toEqual([...PLUMIX_LOCALES].sort());
  });

  test("resolves the English source strings", () => {
    expect(welcomeMessages("en").heading).toBe("Your site is ready.");
  });

  test("falls back to English for a locale with no catalog entry", () => {
    expect(welcomeMessages("xx").heading).toBe("Your site is ready.");
  });
});

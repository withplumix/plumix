import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { PLUMIX_LOCALES } from "@plumix/lingui-config";

import { resolveBarLocale } from "./i18n.js";

const LOCALES_DIR = fileURLToPath(new URL("../../locales", import.meta.url));

describe("admin-bar catalogs", () => {
  test("the bar's locale set stays in lockstep with PLUMIX_LOCALES", () => {
    // Adding a locale to the shared lingui config without shipping a
    // bar catalog would silently fall back to English — fail loud here.
    const poLocales = readdirSync(LOCALES_DIR)
      .filter((f) => f.startsWith("admin-bar-") && f.endsWith(".po"))
      .map((f) => f.replace(/^admin-bar-/, "").replace(/\.po$/, ""))
      .sort();
    expect(poLocales).toEqual([...PLUMIX_LOCALES].sort());
    for (const locale of PLUMIX_LOCALES) {
      expect(resolveBarLocale({ meta: { locale } })).toBe(locale);
    }
  });
});

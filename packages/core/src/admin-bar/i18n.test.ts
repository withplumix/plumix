import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { PLUMIX_LOCALES } from "@plumix/lingui-config";

import { barMessages, resolveBarLocale } from "./i18n.js";

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

  test("every locale resolves translated strings, not the English fallback", () => {
    for (const locale of ["de", "uk", "ar", "zh-CN"] as const) {
      const strings = barMessages(locale);
      // `edit` differs from English in every shipped locale — if the
      // compiled catalog went missing the fallback would leak through.
      expect(strings.edit).not.toBe("Edit");
      expect(strings.navAria.length).toBeGreaterThan(0);
    }
    expect(barMessages("en").edit).toBe("Edit");
  });
});

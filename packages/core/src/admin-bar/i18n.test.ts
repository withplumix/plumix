import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { PLUMIX_LOCALES } from "@plumix/lingui-config";

import { resolveBarLocale, resolveMessage } from "./i18n.js";

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

  // Whether every locale is actually translated (vs. leaking the English
  // fallback) is a catalog-completeness concern, gated by `i18n:ratchet` — not
  // a unit test. Here we test the resolution logic and the string wiring.
  test("resolveMessage prefers the catalog entry over the source message", () => {
    const descriptor = { id: "core.adminBar.edit", message: "Edit" };
    expect(
      resolveMessage({ "core.adminBar.edit": ["Bearbeiten"] }, descriptor),
    ).toBe("Bearbeiten");
    expect(
      resolveMessage({ "core.adminBar.edit": "Bearbeiten" }, descriptor),
    ).toBe("Bearbeiten");
  });

  test("resolveMessage falls back to the source message when the entry is missing or empty", () => {
    const descriptor = { id: "core.adminBar.edit", message: "Edit" };
    expect(resolveMessage({}, descriptor)).toBe("Edit");
    expect(resolveMessage({ "core.adminBar.edit": [""] }, descriptor)).toBe(
      "Edit",
    );
  });
});

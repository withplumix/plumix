import { describe, expect, test } from "vitest";

import type { ResolvedLocale } from "../i18n/locale-registry.js";
import { rewriteAdminShellLangDir } from "./admin-shell.js";

const arabic: ResolvedLocale = {
  code: "ar",
  label: "العربية",
  direction: "rtl",
  enabled: true,
};

describe("rewriteAdminShellLangDir", () => {
  test("swaps the static `lang=en` for the resolved locale's code + direction", () => {
    const html =
      '<!doctype html><html lang="en"><head><title>Plumix Admin</title></head><body></body></html>';

    const rewritten = rewriteAdminShellLangDir(html, arabic);

    expect(rewritten).toContain('<html lang="ar" dir="rtl">');
    expect(rewritten).not.toContain('<html lang="en">');
  });
});

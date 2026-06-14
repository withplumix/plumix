import { describe, expect, test } from "vitest";

import type { ResolvedLocale } from "../i18n/locale-registry.js";
import {
  injectAdminBaseHref,
  rewriteAdminShellLangDir,
} from "./admin-shell.js";

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

describe("injectAdminBaseHref", () => {
  test("inserts a <base href> at the top of <head> so relative assets resolve under the mount", () => {
    const html =
      '<!doctype html><html lang="en"><head><title>Plumix Admin</title></head><body></body></html>';

    const rewritten = injectAdminBaseHref(
      html,
      "/custom-directory/_plumix/admin/",
    );

    expect(rewritten).toContain(
      '<head><base href="/custom-directory/_plumix/admin/">',
    );
  });

  test("is a no-op when the shell has no <head> to anchor against", () => {
    const html = "<!doctype html><title>admin</title>";
    expect(injectAdminBaseHref(html, "/_plumix/admin/")).toBe(html);
  });
});

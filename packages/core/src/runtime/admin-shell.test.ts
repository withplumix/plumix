import { describe, expect, test } from "vitest";

import type { AuthenticatedUser } from "../context/app.js";
import type { ResolvedLocale } from "../i18n/locale-registry.js";
import { resolveLocales } from "../i18n/locale-registry.js";
import {
  resolveAdminShellLocale,
  rewriteAdminShellLangDir,
} from "./admin-shell.js";

const arabic: ResolvedLocale = {
  code: "ar",
  label: "العربية",
  direction: "rtl",
  enabled: true,
};

const enArFr = resolveLocales({
  defaultLocale: "en",
  locales: ["en", "ar", "fr"],
});

function user(meta: Record<string, unknown> = {}): AuthenticatedUser {
  return { id: 1, email: "u@x", role: "admin", meta };
}

function adminRequest(
  opts: {
    url?: string;
    cookie?: string;
  } = {},
): Request {
  return new Request(opts.url ?? "https://cms.example/_plumix/admin/", {
    headers: opts.cookie ? { cookie: opts.cookie } : undefined,
  });
}

describe("rewriteAdminShellLangDir", () => {
  test("swaps the static `lang=en` for the resolved locale's code + direction", () => {
    const html =
      '<!doctype html><html lang="en"><head><title>Plumix Admin</title></head><body></body></html>';

    const rewritten = rewriteAdminShellLangDir(html, arabic);

    expect(rewritten).toContain('<html lang="ar" dir="rtl">');
    expect(rewritten).not.toContain('<html lang="en">');
  });
});

describe("resolveAdminShellLocale", () => {
  test("?lang=ar query param wins over user.meta.locale and cookie", () => {
    const resolved = resolveAdminShellLocale({
      request: adminRequest({
        url: "https://cms.example/_plumix/admin/?lang=ar",
        cookie: "plumix-locale=fr",
      }),
      user: user({ locale: "fr" }),
      i18n: enArFr,
    });

    expect(resolved.code).toBe("ar");
  });

  test("user.meta.locale wins over the plumix-locale cookie for authenticated users", () => {
    const resolved = resolveAdminShellLocale({
      request: adminRequest({ cookie: "plumix-locale=fr" }),
      user: user({ locale: "ar" }),
      i18n: enArFr,
    });

    expect(resolved.code).toBe("ar");
  });

  test("plumix-locale cookie applies for anonymous visitors (WP wp_lang parity)", () => {
    const resolved = resolveAdminShellLocale({
      request: adminRequest({ cookie: "plumix-locale=fr" }),
      user: null,
      i18n: enArFr,
    });

    expect(resolved.code).toBe("fr");
  });

  test("falls back to the site default when no signals match", () => {
    const resolved = resolveAdminShellLocale({
      request: adminRequest(),
      user: null,
      i18n: enArFr,
    });

    expect(resolved).toBe(enArFr.defaultLocale);
  });

  test("cookie pointing at an unsupported code falls through to the default", () => {
    const resolved = resolveAdminShellLocale({
      request: adminRequest({ cookie: "plumix-locale=de" }),
      user: null,
      i18n: enArFr,
    });

    expect(resolved.code).toBe("en");
  });
});

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
        cookie: "plumix_locale=fr",
      }),
      user: user({ locale: "fr" }),
      i18n: enArFr,
    });

    expect(resolved.code).toBe("ar");
  });

  test("user.meta.locale wins over the plumix_locale cookie for authenticated users", () => {
    const resolved = resolveAdminShellLocale({
      request: adminRequest({ cookie: "plumix_locale=fr" }),
      user: user({ locale: "ar" }),
      i18n: enArFr,
    });

    expect(resolved.code).toBe("ar");
  });

  test("plumix_locale cookie applies for anonymous visitors (WP wp_lang parity)", () => {
    const resolved = resolveAdminShellLocale({
      request: adminRequest({ cookie: "plumix_locale=fr" }),
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
      request: adminRequest({ cookie: "plumix_locale=de" }),
      user: null,
      i18n: enArFr,
    });

    expect(resolved.code).toBe("en");
  });

  test("Accept-Language exact tag wins when no cookie is set (anonymous first-time visitor)", () => {
    const request = new Request("https://cms.example/_plumix/admin/", {
      headers: { "accept-language": "ar,en;q=0.5" },
    });
    const resolved = resolveAdminShellLocale({
      request,
      user: null,
      i18n: enArFr,
    });

    expect(resolved.code).toBe("ar");
  });

  test("Accept-Language script tag maps to the supported regional variant (zh-Hant → zh-TW)", () => {
    const i18n = resolveLocales({
      defaultLocale: "en",
      locales: ["en", "zh-TW"],
    });
    const request = new Request("https://cms.example/_plumix/admin/", {
      headers: { "accept-language": "zh-Hant" },
    });
    const resolved = resolveAdminShellLocale({ request, user: null, i18n });

    expect(resolved.code).toBe("zh-TW");
  });

  test("Accept-Language base language falls back to a supported regional variant (pt-PT → pt-BR)", () => {
    const i18n = resolveLocales({
      defaultLocale: "en",
      locales: ["en", "pt-BR"],
    });
    const request = new Request("https://cms.example/_plumix/admin/", {
      headers: { "accept-language": "pt-PT" },
    });
    const resolved = resolveAdminShellLocale({ request, user: null, i18n });

    expect(resolved.code).toBe("pt-BR");
  });

  test("Accept-Language is case-insensitive (ZH-HANT → zh-TW)", () => {
    const i18n = resolveLocales({
      defaultLocale: "en",
      locales: ["en", "zh-TW"],
    });
    const request = new Request("https://cms.example/_plumix/admin/", {
      headers: { "accept-language": "ZH-HANT" },
    });
    const resolved = resolveAdminShellLocale({ request, user: null, i18n });

    expect(resolved.code).toBe("zh-TW");
  });

  test("Accept-Language iteration is capped — pathologically long header doesn't blow up the loop", () => {
    // 5000 unmatched entries followed by the real match. With the cap (~16),
    // the loop short-circuits long before reaching the match — first-time
    // visitor with a hostile header falls through to the site default rather
    // than burning CPU on Intl.Locale allocations.
    const hostile = `${Array.from({ length: 5000 }, () => "zz-ZZ").join(",")},ar`;
    const request = new Request("https://cms.example/_plumix/admin/", {
      headers: { "accept-language": hostile },
    });
    const resolved = resolveAdminShellLocale({
      request,
      user: null,
      i18n: enArFr,
    });

    expect(resolved.code).toBe("en");
  });

  test("cookie still wins over Accept-Language when both are present", () => {
    const request = new Request("https://cms.example/_plumix/admin/", {
      headers: { cookie: "plumix_locale=fr", "accept-language": "ar" },
    });
    const resolved = resolveAdminShellLocale({
      request,
      user: null,
      i18n: enArFr,
    });

    expect(resolved.code).toBe("fr");
  });
});

import { describe, expect, test } from "vitest";

import { buildLocaleSwitchUrl, nextSearchForLang } from "./-locale-param.js";

describe("nextSearchForLang", () => {
  test("sets `?lang=` to the chosen code", () => {
    expect(nextSearchForLang({}, "uk")).toEqual({ lang: "uk" });
  });

  test("sets `?lang=` even when the chosen code is the site default", () => {
    // The rendered locale may come from Accept-Language, so picking the site
    // default must still pin the URL.
    expect(nextSearchForLang({ lang: "uk" }, "en")).toEqual({ lang: "en" });
  });

  test("preserves sibling query params across changes", () => {
    // The login route carries `oauth_error`, `magic_link_error`,
    // `email_change_success` and similar; a locale flip must not
    // strip them.
    expect(
      nextSearchForLang(
        { lang: "uk", oauth_error: "access_denied", redirect_to: "/" },
        "en",
      ),
    ).toEqual({
      lang: "en",
      oauth_error: "access_denied",
      redirect_to: "/",
    });
  });
});

describe("buildLocaleSwitchUrl", () => {
  test("emits `?lang=<code>` against the given pathname", () => {
    expect(buildLocaleSwitchUrl({}, "uk", "/_plumix/admin/login")).toBe(
      "/_plumix/admin/login?lang=uk",
    );
  });

  test("preserves sibling search params and coerces numeric values", () => {
    // Login's `email_change_success` round-trip is this case: TanStack
    // Router's search parser hands back number-typed values that need
    // to land in `URLSearchParams` as strings.
    expect(
      buildLocaleSwitchUrl(
        { redirect_to: "/", email_change_success: 1 },
        "de",
        "/_plumix/admin/login",
      ),
    ).toBe(
      "/_plumix/admin/login?redirect_to=%2F&email_change_success=1&lang=de",
    );
  });
});

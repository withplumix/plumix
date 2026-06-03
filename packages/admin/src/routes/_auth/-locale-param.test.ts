import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  buildLocaleCookie,
  nextSearchForLang,
  writeLocaleCookie,
} from "./-locale-param.js";

describe("nextSearchForLang", () => {
  test("sets `?lang=` to the chosen code", () => {
    expect(nextSearchForLang({}, "uk")).toEqual({ lang: "uk" });
  });

  test("sets `?lang=` even when the chosen code is the site default", () => {
    // The user's currently-rendered locale may have come from
    // Accept-Language (the admin shell's 4th-tier fallback), so the
    // site default isn't necessarily what they see. Picking "en"
    // explicitly must pin the URL or the next reload reverts to
    // whatever Accept-Language resolves.
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

describe("buildLocaleCookie", () => {
  test("serializes the full cookie attribute set without Secure", () => {
    // Matches the post-auth `user.setLocale` server writer; a drift
    // means pre-auth picks and post-auth picks would write different
    // cookies and break each other's persistence.
    expect(buildLocaleCookie("uk", false)).toBe(
      "plumix_locale=uk; Path=/_plumix/admin/; Max-Age=31536000; SameSite=Lax",
    );
  });

  test("appends Secure when called over HTTPS", () => {
    expect(buildLocaleCookie("uk", true)).toBe(
      "plumix_locale=uk; Path=/_plumix/admin/; Max-Age=31536000; SameSite=Lax; Secure",
    );
  });

  // Note: `code` is written raw to match the server-side builder
  // (`packages/core/src/rpc/procedures/user/set-locale.ts:47-56`). The
  // dropdown is the validation seam — only registry-matched codes reach
  // either builder, so smuggling defense lives upstream.
});

describe("writeLocaleCookie", () => {
  // jsdom respects the cookie `Path` attribute, so `document.cookie` at
  // the test's location `/` won't read a cookie scoped to
  // `/_plumix/admin/`. Spy on the setter to capture the raw write.
  let writes: string[] = [];
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    Document.prototype,
    "cookie",
  );

  beforeEach(() => {
    writes = [];
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => writes.join("; "),
      set: (value: string) => writes.push(value),
    });
  });

  afterEach(() => {
    if (originalDescriptor)
      Object.defineProperty(Document.prototype, "cookie", originalDescriptor);
  });

  test("writes the cookie string to document.cookie", () => {
    writeLocaleCookie("uk", { secure: false });
    expect(writes).toEqual([buildLocaleCookie("uk", false)]);
  });
});

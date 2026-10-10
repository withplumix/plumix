import { describe, expect, test } from "vitest";

import { buildLocaleCookie } from "./cookie.js";

// Several writers (`document.cookie`, the `user.setLocale` RPC) must produce
// byte-identical cookies, or persistence silently splits.

describe("buildLocaleCookie", () => {
  test("serializes the full cookie attribute set without Secure", () => {
    expect(buildLocaleCookie("uk", false)).toBe(
      "plumix_locale=uk; Path=/_plumix/; Max-Age=31536000; SameSite=Lax",
    );
  });

  test("appends Secure when called over HTTPS", () => {
    expect(buildLocaleCookie("uk", true)).toBe(
      "plumix_locale=uk; Path=/_plumix/; Max-Age=31536000; SameSite=Lax; Secure",
    );
  });
});

import { describe, expect, test } from "vitest";

import { buildLocaleCookie } from "./cookie.js";

// Three writers must produce byte-identical cookies — the pre-auth login
// dropdown (`document.cookie =`), the post-auth `user.setLocale` RPC
// (`Set-Cookie` header), and any future writer. The reader in
// `runtime/admin-shell.ts` pins the name; pin the full string here so
// drift surfaces immediately rather than as a silent persistence split.

describe("buildLocaleCookie", () => {
  test("serializes the full cookie attribute set without Secure", () => {
    expect(buildLocaleCookie("uk", false)).toBe(
      "plumix_locale=uk; Path=/_plumix/admin/; Max-Age=31536000; SameSite=Lax",
    );
  });

  test("appends Secure when called over HTTPS", () => {
    expect(buildLocaleCookie("uk", true)).toBe(
      "plumix_locale=uk; Path=/_plumix/admin/; Max-Age=31536000; SameSite=Lax; Secure",
    );
  });
});

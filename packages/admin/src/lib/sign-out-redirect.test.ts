import { describe, expect, test } from "vitest";

import { sanitiseRedirect } from "./sign-out-redirect.js";

describe("sanitiseRedirect", () => {
  test.each([
    ["javascript scheme", "javascript:alert(1)"],
    ["data scheme", "data:text/html,<script>"],
    ["protocol-relative", "//attacker.example/logout"],
    ["plain http", "http://insecure.example/logout"],
    ["relative path", "logout"],
    ["CR injection", "https://idp.example/logout\r\nset-cookie: x=y"],
    ["empty", ""],
    ["absent", undefined],
  ])("drops an unsafe redirectTo (%s)", (_name, bad) => {
    expect(sanitiseRedirect(bad)).toBeNull();
  });

  test.each(["/", "/_plumix/admin/login", "https://idp.example/logout?x=1"])(
    "keeps %s",
    (safe) => {
      expect(sanitiseRedirect(safe)).toBe(safe);
    },
  );
});

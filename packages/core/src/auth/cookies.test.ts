import { describe, expect, test } from "vitest";

import {
  isSecureRequest,
  readSessionCookie,
  SESSION_COOKIE_NAME,
} from "./cookies.js";

describe("readSessionCookie", () => {
  test("only accepts the session from the Cookie header — never from URL or body", () => {
    // The Copenhagen Book rule: session IDs must not be readable from query
    // strings or form submissions. Our reader is cookie-only by construction.
    const req = new Request(
      `https://x.example/?${SESSION_COOKIE_NAME}=stolen`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `${SESSION_COOKIE_NAME}=stolen`,
      },
    );
    expect(readSessionCookie(req)).toBeNull();
  });

  test("parses the cookie value when present in the Cookie header", () => {
    const req = new Request("https://x.example", {
      headers: {
        cookie: `other=foo; ${SESSION_COOKIE_NAME}=abc; trailing=bar`,
      },
    });
    expect(readSessionCookie(req)).toBe("abc");
  });
});

describe("isSecureRequest", () => {
  test("controls the Secure flag based on request protocol", () => {
    expect(isSecureRequest(new Request("https://x.example"))).toBe(true);
    expect(isSecureRequest(new Request("http://x.example"))).toBe(false);
  });
});

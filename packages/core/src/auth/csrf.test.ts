import { describe, expect, test } from "vitest";

import {
  CSRF_HEADER_NAME,
  CSRF_HEADER_VALUE,
  hasCsrfHeader,
  hasMatchingOrigin,
} from "./csrf.js";

function req(method: string, headers: Record<string, string> = {}): Request {
  return new Request("https://cms.example.com/_plumix/rpc/post.list", {
    method,
    headers,
  });
}

const allowed = ["https://cms.example.com"];

describe("CSRF defences", () => {
  test("custom header is required for non-safe methods, GETs pass through", () => {
    expect(hasCsrfHeader(req("GET"))).toBe(true);
    expect(hasCsrfHeader(req("POST"))).toBe(false);
    expect(
      hasCsrfHeader(req("POST", { [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE })),
    ).toBe(true);
  });

  test("Origin must match the allowlist; cross-origin POSTs are rejected", () => {
    expect(
      hasMatchingOrigin(req("POST", { origin: "https://cms.example.com" }), {
        allowed,
      }),
    ).toBe(true);
    expect(
      hasMatchingOrigin(req("POST", { origin: "https://attacker.example" }), {
        allowed,
      }),
    ).toBe(false);
  });

  test("falls back to Referer when Origin is absent (some legacy clients)", () => {
    expect(
      hasMatchingOrigin(
        req("POST", { referer: "https://cms.example.com/admin" }),
        { allowed },
      ),
    ).toBe(true);
    expect(hasMatchingOrigin(req("POST"), { allowed })).toBe(false);
  });
});

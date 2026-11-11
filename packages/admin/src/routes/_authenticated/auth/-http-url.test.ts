import { describe, expect, test } from "vitest";

import { isHttpUrl } from "./-http-url.js";

describe("whether the consent page may send the person on to a URL", () => {
  test.each([
    "https://claude.ai/api/mcp/auth_callback?code=abc&iss=https%3A%2F%2Fsite.example",
    "http://127.0.0.1:8080/callback?error=access_denied",
  ])("it may to %s", (url) => {
    expect(isHttpUrl(url)).toBe(true);
  });

  test.each([
    "javascript:void(0)//?error=access_denied",
    "data:text/html,callback",
    "callback",
  ])("it may not to %s", (url) => {
    expect(isHttpUrl(url)).toBe(false);
  });
});

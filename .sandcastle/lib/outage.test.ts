import { describe, expect, test } from "vitest";

import { looksLikeAnOutage } from "./outage.js";

describe("looksLikeAnOutage", () => {
  test.each([
    "Claude AI usage limit reached",
    "rate_limit_error: too many requests",
    "HTTP 429 Too Many Requests",
    "Your credit balance is too low to access the Anthropic API",
    "quota exceeded for this organisation",
    "401 Unauthorized",
    "authentication_error: invalid x-api-key",
    "OAuth token has expired",
    "API Error: 529 overloaded_error",
  ])("stops the run on %s", (reason) => {
    expect(looksLikeAnOutage(reason)).toBe(true);
  });

  test.each([
    "the implementer produced no commits",
    "still failing `pnpm test:e2e` after 4 fix rounds",
    "2 high-severity finding(s) still open after 3 review rounds",
    "pull request was closed without merging",
    "the fixer changed nothing: the host is missing libnss3",
  ])("parks the ticket on %s", (reason) => {
    expect(looksLikeAnOutage(reason)).toBe(false);
  });
});

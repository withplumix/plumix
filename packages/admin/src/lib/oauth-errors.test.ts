import { describe, expect, test } from "vitest";

import { OAUTH_ERROR_CODES } from "@plumix/core";

import { getOAuthErrorMessage, OAUTH_ERROR_MESSAGES } from "./oauth-errors.js";

describe("getOAuthErrorMessage", () => {
  test("maps every server-defined error code", () => {
    // The login page reads from this map. Adding a code in core without
    // updating the admin map silently degrades to the fallback string —
    // this assertion catches that drift.
    for (const code of OAUTH_ERROR_CODES) {
      expect(OAUTH_ERROR_MESSAGES[code]).toBeDefined();
      expect(OAUTH_ERROR_MESSAGES[code]).toMatch(/\S/);
    }
  });

  test("returns null for empty / undefined codes", () => {
    expect(getOAuthErrorMessage(undefined)).toBeNull();
    expect(getOAuthErrorMessage("")).toBeNull();
  });

  test("falls back to the generic message for unknown codes", () => {
    const message = getOAuthErrorMessage("something_the_server_added_later");
    expect(message).toMatch(/try again/i);
  });
});

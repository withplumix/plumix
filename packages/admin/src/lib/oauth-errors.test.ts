import { describe, expect, test } from "vitest";

import { OAUTH_ERROR_CODES } from "@plumix/core";

import { OAUTH_ERROR_MESSAGES, oauthErrorDescriptor } from "./oauth-errors.js";

describe("oauthErrorDescriptor", () => {
  test("maps every server-defined error code", () => {
    // The login page reads from this map. Adding a code in core without
    // updating the admin map silently degrades to the fallback
    // descriptor — this assertion catches that drift.
    for (const code of OAUTH_ERROR_CODES) {
      expect(OAUTH_ERROR_MESSAGES[code].message).toMatch(/\S/);
    }
  });

  test("returns null for empty / undefined codes", () => {
    expect(oauthErrorDescriptor(undefined)).toBeNull();
    expect(oauthErrorDescriptor("")).toBeNull();
  });

  test("falls back to the generic descriptor for unknown codes", () => {
    const descriptor = oauthErrorDescriptor("something_the_server_added_later");
    expect(descriptor).not.toBeNull();
    expect(descriptor?.message).toMatch(/try again/i);
  });
});

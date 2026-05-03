import { describe, expect, test } from "vitest";

import { MAGIC_LINK_ERROR_CODES } from "@plumix/core";

import {
  getMagicLinkErrorMessage,
  MAGIC_LINK_ERROR_MESSAGES,
} from "./magic-link-errors.js";

describe("getMagicLinkErrorMessage", () => {
  test("maps every server-defined error code", () => {
    // Adding a code in core without updating this map silently degrades
    // to the fallback string. Catch the drift here.
    for (const code of MAGIC_LINK_ERROR_CODES) {
      expect(MAGIC_LINK_ERROR_MESSAGES[code]).toBeDefined();
      expect(MAGIC_LINK_ERROR_MESSAGES[code]).toMatch(/\S/);
    }
  });

  test("returns null for empty / undefined codes", () => {
    expect(getMagicLinkErrorMessage(undefined)).toBeNull();
    expect(getMagicLinkErrorMessage("")).toBeNull();
  });

  test("falls back to the generic message for unknown codes", () => {
    const message = getMagicLinkErrorMessage("server_added_a_new_code");
    expect(message).toMatch(/try again/i);
  });
});

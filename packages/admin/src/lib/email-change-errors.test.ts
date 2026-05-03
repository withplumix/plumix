import { describe, expect, test } from "vitest";

import { EMAIL_CHANGE_ERROR_CODES } from "@plumix/core";

import {
  EMAIL_CHANGE_ERROR_MESSAGES,
  getEmailChangeErrorMessage,
} from "./email-change-errors.js";

describe("getEmailChangeErrorMessage", () => {
  test("maps every server-defined error code", () => {
    // Drift detection: adding a code in core's
    // `EMAIL_CHANGE_ERROR_CODES` without updating this map would
    // silently degrade to the fallback string on the login screen.
    for (const code of EMAIL_CHANGE_ERROR_CODES) {
      expect(EMAIL_CHANGE_ERROR_MESSAGES[code]).toBeDefined();
      expect(EMAIL_CHANGE_ERROR_MESSAGES[code]).toMatch(/\S/);
    }
  });

  test("returns null for empty / undefined codes", () => {
    expect(getEmailChangeErrorMessage(undefined)).toBeNull();
    expect(getEmailChangeErrorMessage("")).toBeNull();
  });

  test("falls back to the generic message for unknown codes", () => {
    const message = getEmailChangeErrorMessage("server_added_a_new_code");
    expect(message).toMatch(/try again/i);
  });
});

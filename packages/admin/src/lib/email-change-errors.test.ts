import { describe, expect, test } from "vitest";

import { EMAIL_CHANGE_ERROR_CODES } from "@plumix/core";

import {
  EMAIL_CHANGE_ERROR_MESSAGES,
  emailChangeErrorDescriptor,
} from "./email-change-errors.js";

describe("emailChangeErrorDescriptor", () => {
  test("maps every server-defined error code", () => {
    // Drift detection: adding a code in core's
    // `EMAIL_CHANGE_ERROR_CODES` without updating this map would
    // silently degrade to the fallback descriptor on the login screen.
    for (const code of EMAIL_CHANGE_ERROR_CODES) {
      expect(EMAIL_CHANGE_ERROR_MESSAGES[code].message).toMatch(/\S/);
    }
  });

  test("returns null for empty / undefined codes", () => {
    expect(emailChangeErrorDescriptor(undefined)).toBeNull();
    expect(emailChangeErrorDescriptor("")).toBeNull();
  });

  test("falls back to the generic descriptor for unknown codes", () => {
    const descriptor = emailChangeErrorDescriptor("server_added_a_new_code");
    expect(descriptor).not.toBeNull();
    expect(descriptor?.message).toMatch(/try again/i);
  });
});

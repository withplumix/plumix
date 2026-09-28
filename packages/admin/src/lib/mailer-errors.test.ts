import { afterEach, describe, expect, test, vi } from "vitest";

import { testSendErrorMessage } from "./mailer-errors.js";

describe("testSendErrorMessage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("known `mailer_not_configured` reason resolves to the localized descriptor", () => {
    const err = { data: { reason: "mailer_not_configured" } };
    const result = testSendErrorMessage(err);
    expect(typeof result).toBe("object");
    expect(result).toMatchObject({ id: "mailer.test.error.notConfigured" });
  });

  test("known `mailer_send_failed` reason resolves to the localized descriptor", () => {
    const err = { data: { reason: "mailer_send_failed" } };
    const result = testSendErrorMessage(err);
    expect(result).toMatchObject({ id: "mailer.test.error.sendFailed" });
  });

  test("an unmapped `Error` falls back to the retry message, not its text", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = testSendErrorMessage(new Error("Internal Server Error"));
    expect(result).toMatchObject({ id: "mailer.test.error.fallback" });
  });

  test("unrecognized shape falls back to the translatable retry message", () => {
    const result = testSendErrorMessage({ random: "shape" });
    expect(result).toMatchObject({ id: "mailer.test.error.fallback" });
  });

  test("undefined / null fall back to the translatable retry message", () => {
    expect(testSendErrorMessage(undefined)).toMatchObject({
      id: "mailer.test.error.fallback",
    });
    expect(testSendErrorMessage(null)).toMatchObject({
      id: "mailer.test.error.fallback",
    });
  });
});

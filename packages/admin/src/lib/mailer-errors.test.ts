import { describe, expect, test } from "vitest";

import { testSendErrorMessage } from "./mailer-errors.js";

describe("testSendErrorMessage", () => {
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

  test("raw `Error` returns the plugin-author message as a string", () => {
    // Critical: this is the behavior the previous synthetic-descriptor
    // shape (`{id:"mailer.test.error.runtime", message: err.message}`)
    // masked — it returned an unextracted descriptor that emitted a
    // Lingui `_missing` event on every render. The union shape returns
    // the raw string so the render-site discriminator skips Lingui
    // entirely for plugin-author text.
    const result = testSendErrorMessage(new Error("plugin-author copy"));
    expect(typeof result).toBe("string");
    expect(result).toBe("plugin-author copy");
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

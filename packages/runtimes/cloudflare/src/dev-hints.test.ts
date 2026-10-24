import { describe, expect, test } from "vitest";

import { bindingErrorHint } from "./dev-hints.js";

describe("bindingErrorHint", () => {
  test.each([
    "Missing binding: DB",
    "missing required binding DB",
    "no binding named DB",
  ])("matches %j", (message) => {
    expect(bindingErrorHint.matches(new Error(message))).toBe(true);
  });

  test("tells the developer to declare the binding in wrangler.jsonc", () => {
    expect(bindingErrorHint.body).toContain("wrangler.jsonc");
  });

  test("does not match an unrelated error", () => {
    expect(bindingErrorHint.matches(new Error("no such table: posts"))).toBe(
      false,
    );
  });

  test("does not match a thrown string", () => {
    expect(bindingErrorHint.matches("Missing binding: DB")).toBe(false);
  });
});

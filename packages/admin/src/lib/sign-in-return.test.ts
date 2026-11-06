import { describe, expect, test } from "vitest";

import { signInReturnPath } from "./sign-in-return.js";

describe("where sign-in returns to", () => {
  test("the admin page the person was sent away from", () => {
    expect(signInReturnPath("/auth/authorize?client_id=x")).toBe(
      "/auth/authorize?client_id=x",
    );
  });

  test.each([
    ["no page", undefined],
    ["another origin", "https://evil.example/"],
    ["a protocol-relative URL", "//evil.example/"],
    ["a backslash URL", "/\\evil.example/"],
    ["a relative path", "auth/authorize"],
  ])("the dashboard for %s", (_, next) => {
    expect(signInReturnPath(next)).toBe("/");
  });
});

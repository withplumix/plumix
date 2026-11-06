import { describe, expect, test } from "vitest";

import { signInRedirectTo, signInReturnPath } from "./sign-in-return.js";

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

describe("where a sign-in that leaves the admin returns to", () => {
  test("the admin page the person was sent away from, as a site path", () => {
    expect(signInRedirectTo("/auth/authorize?client_id=x")).toBe(
      "/_plumix/admin/auth/authorize?client_id=x",
    );
  });

  test("the server's default when no page sent the person here", () => {
    expect(signInRedirectTo(undefined)).toBeUndefined();
  });

  test("the dashboard for a page off the admin", () => {
    expect(signInRedirectTo("//evil.example/")).toBe("/_plumix/admin/");
  });
});

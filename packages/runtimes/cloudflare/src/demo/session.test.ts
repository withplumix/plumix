import { describe, expect, test } from "vitest";

import { DEMO_SHOWCASE_NAME, hasDemoSession } from "./session.js";

const withCookie = (value: string) =>
  new Request("https://demo.example/", {
    headers: { cookie: `plumix_demo=${value}` },
  });

describe("hasDemoSession", () => {
  test("true when a demo session cookie is present", () => {
    expect(hasDemoSession(withCookie("abc123"))).toBe(true);
  });

  test("false for an anonymous request", () => {
    expect(hasDemoSession(new Request("https://demo.example/"))).toBe(false);
  });

  test("false for the reserved showcase name (treated as absent)", () => {
    expect(hasDemoSession(withCookie(DEMO_SHOWCASE_NAME))).toBe(false);
  });
});

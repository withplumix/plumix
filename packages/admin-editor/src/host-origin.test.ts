import { describe, expect, test } from "vitest";

import { resolveHostOrigin } from "./host-origin.js";

describe("resolveHostOrigin", () => {
  test("uses the plumix.host param when present (admin shell origin)", () => {
    const origin = resolveHostOrigin(
      "?preview=tok&plumix.edit&plumix.host=https%3A%2F%2Fadmin.example",
      "https://site.example",
    );
    expect(origin).toBe("https://admin.example");
  });

  test("falls back to the current origin (same-origin deployment)", () => {
    expect(resolveHostOrigin("?plumix.edit", "https://site.example")).toBe(
      "https://site.example",
    );
  });

  test("falls back when plumix.host is malformed (never breaks the bridge)", () => {
    expect(
      resolveHostOrigin("?plumix.host=not-a-url", "https://site.example"),
    ).toBe("https://site.example");
  });
});

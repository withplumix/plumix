import { describe, expect, test } from "vitest";

import { gravatarUrl } from "./gravatar.js";

describe("gravatarUrl", () => {
  test("builds a gravatar avatar URL with a 64-char sha256 hash", async () => {
    const url = await gravatarUrl("person@example.com");
    expect(url).toMatch(
      /^https:\/\/www\.gravatar\.com\/avatar\/[0-9a-f]{64}\?/,
    );
  });

  test("normalizes case and surrounding whitespace before hashing", async () => {
    const a = await gravatarUrl("  Person@Example.COM ");
    const b = await gravatarUrl("person@example.com");
    expect(a).toBe(b);
  });

  test("different emails produce different hashes", async () => {
    const a = await gravatarUrl("a@example.com");
    const b = await gravatarUrl("b@example.com");
    expect(a).not.toBe(b);
  });

  test("includes a default size and fallback image", async () => {
    const url = await gravatarUrl("person@example.com");
    expect(url).toContain("s=80");
    expect(url).toContain("d=mp");
  });

  test("size is overridable", async () => {
    const url = await gravatarUrl("person@example.com", { size: 48 });
    expect(url).toContain("s=48");
  });
});

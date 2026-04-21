import { describe, expect, test } from "vitest";

import { slugify } from "./slugify.js";

describe("slugify", () => {
  test("lowercases and hyphenates ASCII titles", () => {
    expect(slugify("Hello World")).toBe("hello-world");
    expect(slugify("Quantum Mechanics 101")).toBe("quantum-mechanics-101");
  });

  test("collapses runs of non-alphanumerics into single dashes", () => {
    expect(slugify("foo   bar!!!baz")).toBe("foo-bar-baz");
    expect(slugify("News & Updates")).toBe("news-updates");
  });

  test("trims leading and trailing dashes", () => {
    expect(slugify("  padded  ")).toBe("padded");
    expect(slugify("---hello---")).toBe("hello");
  });

  test("returns empty string for all-non-ASCII input", () => {
    // Editor form handles this via `slug: minLength(1)` validation so the
    // user sees an inline error rather than a confusing server rejection.
    expect(slugify("---")).toBe("");
    expect(slugify("Новости")).toBe("");
  });

  test("preserves existing hyphen separation (idempotent on valid input)", () => {
    expect(slugify("hello-world")).toBe("hello-world");
  });
});

import { describe, expect, test } from "vitest";

import { slugify } from "./slugify.js";

describe("slugify", () => {
  test("lowercases and kebab-cases ASCII titles", () => {
    expect(slugify("Hello World")).toBe("hello-world");
    expect(slugify("Quantum Mechanics 101")).toBe("quantum-mechanics-101");
  });

  test("collapses runs of non-alphanumerics into single dashes", () => {
    expect(slugify("foo   bar!!!baz")).toBe("foo-bar-baz");
    expect(slugify("News & Updates")).toBe("news-and-updates");
  });

  test("trims leading and trailing separators", () => {
    expect(slugify("  padded  ")).toBe("padded");
    expect(slugify("---hello---")).toBe("hello");
  });

  test("strips diacritics from Latin-extended input", () => {
    expect(slugify("café")).toBe("cafe");
    expect(slugify("Crème Brûlée")).toBe("creme-brulee");
    expect(slugify("São Paulo")).toBe("sao-paulo");
  });

  test("transliterates Cyrillic / Arabic / Turkish / Vietnamese", () => {
    // Motivating case: a Russian editor creating a post titled
    // "Новости" gets a usable slug instead of an empty string.
    // The underlying transliterate lib covers European, Cyrillic,
    // Greek, Arabic, Turkish, and Vietnamese scripts.
    expect(slugify("Новости")).toBe("novosti");
    expect(slugify("Привет мир")).toBe("privet-mir");
    expect(slugify("مرحبا")).toBe("mrhba");
    expect(slugify("İstanbul")).toBe("istanbul");
    expect(slugify("Tiếng Việt")).toBe("tieng-viet");
  });

  test("CJK falls back to empty — user types a slug manually", () => {
    // `@sindresorhus/transliterate` doesn't ship a CJK lookup table;
    // Japanese/Chinese titles resolve to empty and the form's
    // `slugSchema.minLength(1)` prompts the author to type one. If
    // CJK support becomes a priority, pair this with `pinyin-pro`.
    expect(slugify("日本語")).toBe("");
    expect(slugify("你好")).toBe("");
  });

  test("returns empty string for unslugifiable input", () => {
    // Pure punctuation / emoji has no letters to transliterate — form
    // validates via `slugSchema.minLength(1)` so the user sees an
    // inline error rather than a confusing server rejection.
    expect(slugify("---")).toBe("");
    expect(slugify("🎉🎉")).toBe("");
  });

  test("mixed-script falls back to the slugifiable portion", () => {
    // CJK portion has no lookup; the Latin portion survives — better
    // than dropping the whole string. Locks in "partial fallback is
    // non-empty" as the contract.
    expect(slugify("Hello 世界")).toBe("hello");
  });

  test("handles very long input without length-capping", () => {
    // Callers bound input via `slugSchema.maxLength(200)`; the helper
    // itself is pure transliteration + normalization, no truncation.
    const long = "a".repeat(1000);
    expect(slugify(long)).toBe(long);
  });

  test("output matches slugSchema's ASCII kebab-case regex", () => {
    // `slugSchema` regex: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
    // Non-empty outputs must pass it so round-tripping through the
    // RPC input schema doesn't reject our own derivations.
    const asciiKebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    const inputs = [
      "Hello World",
      "Новости",
      "café",
      "日本語",
      "News & Updates",
    ];
    for (const input of inputs) {
      const output = slugify(input);
      if (output.length > 0) expect(output).toMatch(asciiKebab);
    }
  });
});

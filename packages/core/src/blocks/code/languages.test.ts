import { describe, expect, test } from "vitest";

import {
  CODE_LANGUAGES,
  LANGUAGE_ALIASES,
  normalizeLanguage,
} from "./languages.js";

describe("normalizeLanguage", () => {
  test("returns undefined for empty or whitespace-only input", () => {
    expect(normalizeLanguage("")).toBeUndefined();
    expect(normalizeLanguage("   ")).toBeUndefined();
    expect(normalizeLanguage(undefined)).toBeUndefined();
  });

  test("passes a canonical language through unchanged", () => {
    expect(normalizeLanguage("typescript")).toBe("typescript");
    expect(normalizeLanguage("rust")).toBe("rust");
  });

  test("maps common aliases to their canonical id", () => {
    expect(normalizeLanguage("ts")).toBe("typescript");
    expect(normalizeLanguage("py")).toBe("python");
    expect(normalizeLanguage("js")).toBe("javascript");
    expect(normalizeLanguage("sh")).toBe("shell");
  });

  test("is case- and whitespace-insensitive", () => {
    expect(normalizeLanguage("  TypeScript  ")).toBe("typescript");
    expect(normalizeLanguage("RUST")).toBe("rust");
  });

  test("preserves an unknown language verbatim (lowercased) so existing content is untouched", () => {
    expect(normalizeLanguage("brainfuck")).toBe("brainfuck");
  });

  test("every canonical language is a stable, lowercase id", () => {
    for (const lang of CODE_LANGUAGES) {
      expect(lang.id).toBe(lang.id.toLowerCase());
      expect(normalizeLanguage(lang.id)).toBe(lang.id);
    }
  });

  test("every alias resolves to a canonical language id (no typo'd targets)", () => {
    const ids = new Set(CODE_LANGUAGES.map((l) => l.id));
    for (const target of Object.values(LANGUAGE_ALIASES)) {
      expect(ids.has(target)).toBe(true);
    }
  });
});

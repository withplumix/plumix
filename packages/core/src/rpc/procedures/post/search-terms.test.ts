import { describe, expect, test } from "vitest";

import { escapeLikePattern, tokenizeSearchQuery } from "./search-terms.js";

describe("tokenizeSearchQuery", () => {
  test("empty and whitespace-only input yields no terms", () => {
    expect(tokenizeSearchQuery("")).toEqual([]);
    expect(tokenizeSearchQuery("   \t  ")).toEqual([]);
  });

  test("splits bare tokens on whitespace", () => {
    expect(tokenizeSearchQuery("hello world")).toEqual([
      { value: "hello", exclude: false },
      { value: "world", exclude: false },
    ]);
  });

  test("quoted phrases stay whole, with inner whitespace preserved", () => {
    expect(tokenizeSearchQuery('"quantum physics" intro')).toEqual([
      { value: "quantum physics", exclude: false },
      { value: "intro", exclude: false },
    ]);
  });

  test("unterminated opening quote consumes to end-of-input", () => {
    expect(tokenizeSearchQuery('"unterminated thing')).toEqual([
      { value: "unterminated thing", exclude: false },
    ]);
  });

  test("leading dash on a bare token flags exclusion", () => {
    expect(tokenizeSearchQuery("pillow -sofa")).toEqual([
      { value: "pillow", exclude: false },
      { value: "sofa", exclude: true },
    ]);
  });

  test("dash inside a quoted phrase stays literal", () => {
    expect(tokenizeSearchQuery('"-literal dash"')).toEqual([
      { value: "-literal dash", exclude: false },
    ]);
  });

  test("bare `-` with no body is dropped", () => {
    expect(tokenizeSearchQuery("foo - bar")).toEqual([
      { value: "foo", exclude: false },
      { value: "bar", exclude: false },
    ]);
  });

  test("empty quoted phrase is dropped", () => {
    expect(tokenizeSearchQuery('"" real')).toEqual([
      { value: "real", exclude: false },
    ]);
  });

  test("Unicode whitespace (NBSP, etc.) separates terms without hanging", () => {
    // Regression: an earlier pass used an ASCII-only skip while the
    // inner scanner used /\s/, which caused an infinite loop on NBSP.
    expect(tokenizeSearchQuery("foo\u00A0bar")).toEqual([
      { value: "foo", exclude: false },
      { value: "bar", exclude: false },
    ]);
    expect(tokenizeSearchQuery("\u00A0")).toEqual([]);
    expect(tokenizeSearchQuery("a\u2003b\u2003c")).toEqual([
      { value: "a", exclude: false },
      { value: "b", exclude: false },
      { value: "c", exclude: false },
    ]);
  });

  test("tab and newline separators behave like spaces", () => {
    expect(tokenizeSearchQuery("foo\tbar\nbaz")).toEqual([
      { value: "foo", exclude: false },
      { value: "bar", exclude: false },
      { value: "baz", exclude: false },
    ]);
  });
});

describe("escapeLikePattern", () => {
  test("escapes SQL LIKE wildcards", () => {
    expect(escapeLikePattern("50%")).toBe("50\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
  });

  test("escapes the escape character itself", () => {
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
  });

  test("leaves safe characters untouched", () => {
    expect(escapeLikePattern("hello world")).toBe("hello world");
    expect(escapeLikePattern("quote'mark")).toBe("quote'mark");
  });
});

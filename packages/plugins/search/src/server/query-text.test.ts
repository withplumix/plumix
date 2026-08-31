import { describe, expect, test } from "vitest";

import { highlightSnippet, toMatchExpression } from "./query-text.js";

describe("toMatchExpression", () => {
  test("matches a bare word", () => {
    expect(toMatchExpression("hydroponics")).toBe('"hydroponics"');
  });

  test("narrows on each extra word rather than widening", () => {
    // Adjacent phrases are FTS5's implicit AND, so every word has to appear.
    expect(toMatchExpression("winter hydroponics")).toBe(
      '"winter" "hydroponics"',
    );
  });

  test("keeps a quoted phrase whole", () => {
    expect(toMatchExpression('"passing mention" light')).toBe(
      '"passing mention" "light"',
    );
  });

  test("survives an unbalanced quote", () => {
    // A stray quote is a visitor's typo, not a syntax error — the rest of the
    // input becomes the phrase it was opening.
    expect(toMatchExpression('winter "hydroponics')).toBe(
      '"winter" "hydroponics"',
    );
  });

  test("treats FTS5's own operators as words to look for", () => {
    for (const operator of ["AND", "OR", "NOT", "NEAR"]) {
      expect(toMatchExpression(operator), operator).toBe(`"${operator}"`);
    }
    expect(toMatchExpression("cats * dogs ^ -x")).toBe(
      '"cats" "*" "dogs" "^" "-x"',
    );
  });

  test("escapes a quote inside a word by doubling it", () => {
    // Anything less unbalances the expression, the one way this can still
    // hand FTS5 a syntax error.
    expect(toMatchExpression('a"b')).toBe('"a""b"');
  });

  test("has nothing to search for in an empty query", () => {
    expect(toMatchExpression("")).toBeNull();
    expect(toMatchExpression("   ")).toBeNull();
    expect(toMatchExpression('""')).toBeNull();
  });
});

describe("highlightSnippet", () => {
  test("marks what FTS5 matched", () => {
    expect(
      highlightSnippet("Winter <plumix:mark>hydroponics</plumix:mark>"),
    ).toBe("Winter <mark>hydroponics</mark>");
  });

  test("renders script in indexed content inert", () => {
    // FTS5 splices its markers in without escaping anything around them, so an
    // unescaped snippet would run whatever the entry's body happened to hold.
    expect(highlightSnippet("before <script>alert(1)</script> after")).toBe(
      "before &lt;script&gt;alert(1)&lt;/script&gt; after",
    );
  });

  test("escapes an ampersand the content already carried", () => {
    expect(highlightSnippet("Tom &amp; Jerry")).toBe("Tom &amp;amp; Jerry");
  });

  test("cannot be tricked into emitting anything but a mark", () => {
    // Content holding the marker's own text escapes with everything else, so
    // the worst an attacker gets is a stray highlight.
    expect(highlightSnippet("<plumix:mark><script>x</script>")).toBe(
      "<mark>&lt;script&gt;x&lt;/script&gt;",
    );
  });
});

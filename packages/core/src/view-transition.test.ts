import type { TokenIdent } from "@csstools/css-tokenizer";
import { isTokenIdent, tokenize } from "@csstools/css-tokenizer";
import { describe, expect, test } from "vitest";

import { transitionName, viewTransitionTypes } from "./view-transition.js";

// The value a browser reads from `view-transition-name: <name>`: the name
// must tokenize as exactly one ident token, and this is its unescaped value.
function identValue(name: string): string {
  const [token, eof, ...rest] = tokenize({ css: name });
  expect(rest).toEqual([]);
  expect(eof?.[0]).toBe("EOF-token");
  expect(isTokenIdent(token)).toBe(true);
  return (token as TokenIdent)[4].value;
}

describe("transitionName", () => {
  test("a key starting with a digit stays one identifier", () => {
    const name = transitionName("card", "42");

    expect(name).toBe("card_42");
    expect(identValue(name)).toBe("card_42");
  });

  test.each([
    ["hello world", String.raw`card_hello\ world`, "card_hello world"],
    ["a.b/c:d", String.raw`card_a\.b\/c\:d`, "card_a.b/c:d"],
    ["it's (1)!", String.raw`card_it\'s\ \(1\)\!`, "card_it's (1)!"],
    ["tab\there", String.raw`card_tab\9 here`, "card_tab\there"],
  ])("escapes spaces and punctuation in %j", (key, name, value) => {
    expect(transitionName("card", key)).toBe(name);
    expect(identValue(transitionName("card", key))).toBe(value);
  });

  test("a numeric key names the same element as its string form", () => {
    expect(transitionName("post", 42)).toBe(transitionName("post", "42"));
  });

  test.each([
    [-7, String.raw`post_-7`, "post_-7"],
    [1.5, String.raw`post_1\.5`, "post_1.5"],
  ])("a numeric key %d stays one identifier", (key, name, value) => {
    expect(transitionName("post", key)).toBe(name);
    expect(identValue(name)).toBe(value);
  });

  test.each([
    ["1col", String.raw`\31 col_x`, "1col_x"],
    ["-2", String.raw`-\32 _x`, "-2_x"],
    ["", "_x", "_x"],
  ])(
    "escapes a prefix %j that can't start an identifier",
    (prefix, name, value) => {
      expect(transitionName(prefix, "x")).toBe(name);
      expect(identValue(name)).toBe(value);
    },
  );

  // `view-transition-name` drops these silently, compared ASCII
  // case-insensitively.
  const RESERVED = [
    "none",
    "auto",
    "match-element",
    "default",
    "inherit",
    "initial",
    "unset",
    "revert",
    "revert-layer",
  ];

  test.each([
    ["", "none"],
    ["", "NONE"],
    ["", "match-element"],
    ["", ""],
    ["match", "element"],
    ["revert", "layer"],
    ["auto", ""],
    ["inherit", "inherit"],
  ])("prefix %j with key %j never forms a reserved word", (prefix, key) => {
    const value = identValue(transitionName(prefix, key)).toLowerCase();

    expect(RESERVED).not.toContain(value);
  });

  test("an empty key leaves the prefix and separator", () => {
    expect(transitionName("card", "")).toBe("card_");
    expect(identValue(transitionName("card", ""))).toBe("card_");
  });

  test.each([
    ["café", "card_café"],
    ["новости", "card_новости"],
    ["日本語", "card_日本語"],
    ["😀", "card_😀"],
  ])("passes non-ASCII key %j through unescaped", (key, name) => {
    expect(transitionName("card", key)).toBe(name);
    expect(identValue(name)).toBe(name);
  });

  test("the same input gives the same name", () => {
    expect(transitionName("hero image", "1 / a")).toBe(
      transitionName("hero image", "1 / a"),
    );
    expect(transitionName("hero image", "1 / a")).toBe(
      String.raw`hero\ image_1\ \/\ a`,
    );
  });
});

describe("viewTransitionTypes", () => {
  test("names one type per navigation direction", () => {
    expect(viewTransitionTypes).toEqual({
      forward: "nav-forward",
      back: "nav-back",
      replace: "nav-replace",
    });
  });
});

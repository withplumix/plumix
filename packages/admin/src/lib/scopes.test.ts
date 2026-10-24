import { describe, expect, test } from "vitest";

import { parseScopesText, tokenGrantOf } from "./scopes.js";

describe("parseScopesText", () => {
  test("trims each line and drops blank ones", () => {
    expect(parseScopesText(" entry:post:read \r\n\nuser:list\n")).toEqual([
      "entry:post:read",
      "user:list",
    ]);
  });
});

describe("tokenGrantOf", () => {
  test("same as me mints null scopes and no preset", () => {
    expect(tokenGrantOf("inherit", "entry:post:read")).toEqual({
      scopes: null,
    });
  });

  test.each(["read_only", "draft_only"] as const)(
    "%s sends the preset and no scope list",
    (mode) => {
      expect(tokenGrantOf(mode, "entry:post:read")).toEqual({
        scopes: null,
        preset: mode,
      });
    },
  );

  test("restrict sends the parsed capability list", () => {
    expect(tokenGrantOf("restrict", "entry:post:read\nuser:list")).toEqual({
      scopes: ["entry:post:read", "user:list"],
    });
  });
});

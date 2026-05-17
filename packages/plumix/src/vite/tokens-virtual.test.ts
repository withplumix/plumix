import { describe, expect, test } from "vitest";

import {
  loadTokensVirtual,
  resolveTokensVirtualId,
  TOKENS_RESOLVED_ID,
  TOKENS_VIRTUAL_ID,
} from "./tokens-virtual.js";

describe("tokens virtual module", () => {
  test("resolves the public id to a stable resolved id", () => {
    expect(resolveTokensVirtualId(TOKENS_VIRTUAL_ID)).toBe(TOKENS_RESOLVED_ID);
    expect(resolveTokensVirtualId("some/other/module")).toBeUndefined();
  });

  test("emits the active theme's tokens.css when loaded", () => {
    const css = loadTokensVirtual(TOKENS_RESOLVED_ID, {
      colors: { primary: { value: "#0066cc" } },
    });
    expect(css).toContain("--plumix-color-primary: #0066cc;");
    expect(css).toContain(".has-primary-background-color");
  });

  test("returns an empty stylesheet when no theme has declared tokens", () => {
    expect(loadTokensVirtual(TOKENS_RESOLVED_ID, undefined)).toBe("");
    expect(loadTokensVirtual(TOKENS_RESOLVED_ID, {})).toBe("");
  });

  test("returns undefined for a non-matching id", () => {
    expect(loadTokensVirtual("\0virtual:something-else", {})).toBeUndefined();
  });
});

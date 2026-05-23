import { describe, expect, test } from "vitest";

import * as blocksApi from "./index.js";

// Locks the post-cleanup public surface: plumix produces no CSS. Tokens
// are a registry only — themes write the actual `:root` declarations
// against their own pipeline (Tailwind, PostCSS, hand-CSS).
describe("@plumix/blocks public API — post-CSS-cleanup", () => {
  test("does not export tokensToCss", () => {
    expect(blocksApi).not.toHaveProperty("tokensToCss");
  });

  test("exports no CSS-emitter named helper", () => {
    const cssEmitterNames = Object.keys(blocksApi).filter((name) =>
      /(CssEmitter|toCss)$/i.test(name),
    );
    expect(cssEmitterNames).toEqual([]);
  });
});

import { describe, expect, test } from "vitest";

import { css } from "./css-tag.js";

// Plain (non-CSS) content keeps these assertions stable — the `css` tag is a
// no-op at runtime, and prettier only reshapes template bodies it reads as CSS.
describe("css", () => {
  test("returns a template with no interpolations verbatim", () => {
    expect(css`hello world`).toBe("hello world");
  });

  test("splices interpolated values in order between the chunks", () => {
    const a = "one";
    const b = "two";
    expect(css`x-${a}-y-${b}-z`).toBe("x-one-y-two-z");
  });

  test("keeps an interpolation at the very end", () => {
    const tail = "end";
    expect(css`start-${tail}`).toBe("start-end");
  });
});

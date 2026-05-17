import { describe, expect, test } from "vitest";

import { tokensToCss } from "./tokens-to-css.js";

describe("tokensToCss", () => {
  test("returns an empty string for empty tokens", () => {
    expect(tokensToCss({})).toBe("");
  });

  test("emits CSS variables for declared color tokens under :root", () => {
    const css = tokensToCss({
      colors: {
        primary: { value: "#0066cc" },
        accent: { value: "#ff6600" },
      },
    });
    expect(css).toContain(":root {");
    expect(css).toContain("--plumix-color-primary: #0066cc;");
    expect(css).toContain("--plumix-color-accent: #ff6600;");
  });

  test("emits utility classes consuming the CSS variables", () => {
    const css = tokensToCss({
      colors: { primary: { value: "#0066cc" } },
    });
    expect(css).toContain(".has-primary-background-color");
    expect(css).toContain("background-color: var(--plumix-color-primary)");
    expect(css).toContain(".has-primary-color");
    expect(css).toContain("color: var(--plumix-color-primary)");
  });

  test("emits spacing + typography + border utility classes", () => {
    const css = tokensToCss({
      spacing: { md: { value: "1rem" } },
      typography: { lg: { value: "1.25rem" } },
      border: { md: { value: "0.5rem" } },
    });
    expect(css).toContain("--plumix-spacing-md: 1rem;");
    expect(css).toContain(".has-md-padding");
    expect(css).toContain(".has-md-margin");
    expect(css).toContain("--plumix-typography-lg: 1.25rem;");
    expect(css).toContain(".has-lg-font-size");
    expect(css).toContain("--plumix-border-md: 0.5rem;");
    expect(css).toContain(".has-md-border-radius");
  });
});

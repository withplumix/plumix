import { describe, expect, test } from "vitest";

import { resolveBlockStyles } from "./resolve-block-styles.js";

describe("resolveBlockStyles", () => {
  test("returns empty className and style when both inputs are empty", () => {
    const result = resolveBlockStyles(
      {},
      {},
      { colors: {}, spacing: {}, typography: {}, border: {} },
    );
    expect(result).toEqual({ className: "", style: {} });
  });

  test("named color-background token resolves to has-<slug>-background-color class", () => {
    const result = resolveBlockStyles(
      { color: { background: "primary" } },
      { color: { background: true } },
      {
        colors: { primary: { value: "#0066cc", label: "Primary" } },
      },
    );
    expect(result.className).toBe("has-primary-background-color");
    expect(result.style).toEqual({});
  });

  test("raw color value falls through to inline backgroundColor style", () => {
    const result = resolveBlockStyles(
      { color: { background: "#abcdef" } },
      { color: { background: true } },
      { colors: { primary: { value: "#0066cc" } } },
    );
    expect(result.className).toBe("");
    expect(result.style).toEqual({ backgroundColor: "#abcdef" });
  });

  test("missing color-token slug degrades to inline style with literal slug", () => {
    const result = resolveBlockStyles(
      { color: { background: "primary" } },
      { color: { background: true } },
      { colors: {} },
    );
    expect(result.className).toBe("");
    expect(result.style).toEqual({ backgroundColor: "primary" });
  });

  test("ignores style values for axes the spec does not opt into via supports", () => {
    // The reserved attrs.style slot can hold values for axes the
    // block hasn't opted into (e.g. legacy content from before the
    // spec dropped an axis). The resolver must NOT leak those into
    // the rendered output — that would let content silently re-acquire
    // a styling power the spec author removed.
    const result = resolveBlockStyles(
      {
        color: { background: "primary" },
        spacing: { padding: "md" },
      },
      { color: { background: true } },
      {
        colors: { primary: { value: "#0066cc" } },
        spacing: { md: { value: "1rem" } },
      },
    );
    expect(result.className).toBe("has-primary-background-color");
    expect(result.style).toEqual({});
  });

  test("named spacing-padding token resolves to has-<slug>-padding class", () => {
    const result = resolveBlockStyles(
      { spacing: { padding: "md" } },
      { spacing: { padding: true } },
      { spacing: { md: { value: "1rem" } } },
    );
    expect(result.className).toBe("has-md-padding");
    expect(result.style).toEqual({});
  });

  test("anchor slot surfaces as a top-level `id` field on the result", () => {
    // Anchor is special: it's not a class or style, it's an HTML `id`
    // on the rendered element. The resolver exposes it via a dedicated
    // return field so block components can spread it cleanly.
    const result = resolveBlockStyles(
      { anchor: "section-1" },
      { anchor: true },
      {},
    );
    expect(result.id).toBe("section-1");
    expect(result.className).toBe("");
  });

  test("customClassName slot appends raw class verbatim (no token lookup)", () => {
    // customClassName intentionally bypasses the token machinery —
    // it's the explicit escape hatch for one-off Tailwind / utility
    // classes the design system hasn't promoted to tokens yet.
    const result = resolveBlockStyles(
      { customClassName: "alert alert-info" },
      { customClassName: true },
      {},
    );
    expect(result.className).toBe("alert alert-info");
    expect(result.style).toEqual({});
  });

  // Table-driven coverage for the symmetric token-resolving axes. Each
  // row exercises one (slot, supports) pair through the same resolver
  // branch, asserting the slug → `has-<slug>-<suffix>` class mapping.
  // Keeps the spec for "named tokens become utility classes" readable
  // as a single table instead of one identical-shape test per axis.
  test.each([
    {
      axis: "color.text",
      slot: { color: { text: "primary" } },
      supports: { color: { text: true } },
      group: "colors",
      slug: "primary",
      expectedClass: "has-primary-color",
    },
    {
      axis: "spacing.margin",
      slot: { spacing: { margin: "lg" } },
      supports: { spacing: { margin: true } },
      group: "spacing",
      slug: "lg",
      expectedClass: "has-lg-margin",
    },
    {
      axis: "typography.fontSize",
      slot: { typography: { fontSize: "xl" } },
      supports: { typography: { fontSize: true } },
      group: "typography",
      slug: "xl",
      expectedClass: "has-xl-font-size",
    },
    {
      axis: "typography.lineHeight",
      slot: { typography: { lineHeight: "tight" } },
      supports: { typography: { lineHeight: true } },
      group: "typography",
      slug: "tight",
      expectedClass: "has-tight-line-height",
    },
    {
      axis: "typography.fontWeight",
      slot: { typography: { fontWeight: "bold" } },
      supports: { typography: { fontWeight: true } },
      group: "typography",
      slug: "bold",
      expectedClass: "has-bold-font-weight",
    },
    {
      axis: "border.radius",
      slot: { border: { radius: "md" } },
      supports: { border: { radius: true } },
      group: "border",
      slug: "md",
      expectedClass: "has-md-border-radius",
    },
  ] as const)(
    "named $axis token resolves to `$expectedClass`",
    ({ slot, supports, group, slug, expectedClass }) => {
      const tokens = { [group]: { [slug]: { value: "x" } } };
      const result = resolveBlockStyles(slot, supports, tokens);
      expect(result.className).toBe(expectedClass);
      expect(result.style).toEqual({});
    },
  );

  // Raw-value coverage for the same axes — unknown slug or non-token
  // value falls through to inline `style`. Guards against the resolver
  // silently dropping author-provided values when the theme hasn't
  // declared a matching token, and against accidentally widening the
  // class-emission path to non-tokenizable axes.
  test.each([
    {
      axis: "color.text",
      slot: { color: { text: "#abcdef" } },
      supports: { color: { text: true } },
      expectedStyle: { color: "#abcdef" },
    },
    {
      axis: "spacing.margin",
      slot: { spacing: { margin: "8px" } },
      supports: { spacing: { margin: true } },
      expectedStyle: { margin: "8px" },
    },
    {
      axis: "typography.fontSize",
      slot: { typography: { fontSize: "1.25rem" } },
      supports: { typography: { fontSize: true } },
      expectedStyle: { fontSize: "1.25rem" },
    },
    {
      axis: "typography.lineHeight",
      slot: { typography: { lineHeight: "1.4" } },
      supports: { typography: { lineHeight: true } },
      expectedStyle: { lineHeight: "1.4" },
    },
    {
      axis: "typography.fontWeight",
      slot: { typography: { fontWeight: "700" } },
      supports: { typography: { fontWeight: true } },
      expectedStyle: { fontWeight: "700" },
    },
    {
      axis: "border.radius",
      slot: { border: { radius: "4px" } },
      supports: { border: { radius: true } },
      expectedStyle: { borderRadius: "4px" },
    },
  ] as const)(
    "raw $axis value falls through to inline style",
    ({ slot, supports, expectedStyle }) => {
      const result = resolveBlockStyles(slot, supports, {});
      expect(result.className).toBe("");
      expect(result.style).toEqual(expectedStyle);
    },
  );

  test("typography.textAlign and align surface as classes without token lookup", () => {
    // Alignment is enumerated (left/center/right/justify), not
    // token-driven — the class encodes the choice directly.
    const result = resolveBlockStyles(
      { typography: { textAlign: "center" }, align: "wide" },
      { typography: { textAlign: true }, align: true },
      {},
    );
    expect(result.className).toBe("has-text-align-center align-wide");
    expect(result.style).toEqual({});
  });

  test("combines color class + raw spacing inline style on a single call", () => {
    const result = resolveBlockStyles(
      {
        color: { background: "primary" },
        spacing: { padding: "8px" },
      },
      { color: { background: true }, spacing: { padding: true } },
      { colors: { primary: { value: "#0066cc" } } },
    );
    expect(result.className).toBe("has-primary-background-color");
    expect(result.style).toEqual({ padding: "8px" });
  });
});

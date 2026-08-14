import { describe, expect, test } from "vitest";

import type { ThemeTokens, TokenCategory } from "./types.js";
import { emitBlockStyleCss } from "./style-emitter.js";
import { createStyleFields } from "./style-field.js";

const tokens: ThemeTokens = {
  color: { primary: { value: "#0c2238", label: "Primary" } },
  spacing: { sm: { value: "8px" }, lg: { value: "24px", label: "Large" } },
  fontFamily: { serif: { value: "Georgia, serif" } },
};

const makeField = (
  property: string,
  opts?: { readonly category?: TokenCategory },
) => createStyleFields(tokens).field(property, opts);

describe("createStyleField — read (decode a stored value into a selection)", () => {
  test("decodes a token var() for the field's category into a token selection", () => {
    expect(makeField("padding").read("var(--plumix-spacing-lg, 24px)")).toEqual(
      { kind: "token", id: "lg" },
    );
  });

  test("decodes a token whose id the theme no longer declares (stale id stays editable)", () => {
    expect(makeField("padding").read("var(--plumix-spacing-gone)")).toEqual({
      kind: "token",
      id: "gone",
    });
  });

  test("decodes a raw literal into a literal selection", () => {
    expect(makeField("padding").read("20px")).toEqual({
      kind: "literal",
      value: "20px",
    });
  });

  test("decodes a var() from a different category as a literal (not a token)", () => {
    expect(
      makeField("padding").read("var(--plumix-color-primary, #0c2238)"),
    ).toEqual({
      kind: "literal",
      value: "var(--plumix-color-primary, #0c2238)",
    });
  });

  test("decodes empty, null, and undefined as unset (null selection)", () => {
    const field = makeField("padding");
    expect(field.read("")).toBeNull();
    expect(field.read(null)).toBeNull();
    expect(field.read(undefined)).toBeNull();
  });

  test("a property with no token scale only ever reads literals", () => {
    const field = makeField("display");
    expect(field.hasTokens).toBe(false);
    expect(field.read("flex")).toEqual({ kind: "literal", value: "flex" });
  });
});

describe("createStyleField — write (encode a selection into a stored value)", () => {
  test("encodes a token selection to the var() with the token's literal as fallback", () => {
    expect(makeField("padding").write({ kind: "token", id: "lg" })).toBe(
      "var(--plumix-spacing-lg, 24px)",
    );
  });

  test("encodes a token with no registered value to a bare var() (no fallback)", () => {
    expect(makeField("padding").write({ kind: "token", id: "gone" })).toBe(
      "var(--plumix-spacing-gone)",
    );
  });

  test("encodes a literal selection to its raw value", () => {
    expect(makeField("padding").write({ kind: "literal", value: "20px" })).toBe(
      "20px",
    );
  });

  test("encodes an empty literal and a null selection as a clear (null)", () => {
    const field = makeField("padding");
    expect(field.write({ kind: "literal", value: "" })).toBeNull();
    expect(field.write(null)).toBeNull();
  });
});

describe("createStyleField — round-trip (read ∘ write is stable)", () => {
  test("a token selection survives write → read", () => {
    const field = makeField("padding");
    const sel = { kind: "token", id: "lg" } as const;
    expect(field.read(field.write(sel))).toEqual(sel);
  });

  test("a stale token id survives write → read", () => {
    const field = makeField("padding");
    const sel = { kind: "token", id: "gone" } as const;
    expect(field.read(field.write(sel))).toEqual(sel);
  });

  test("a literal selection survives write → read", () => {
    const field = makeField("padding");
    const sel = { kind: "literal", value: "1.5rem" } as const;
    expect(field.read(field.write(sel))).toEqual(sel);
  });
});

describe("createStyleField — token options + category", () => {
  test("exposes the theme's tokens for the category as options in registration order", () => {
    expect(makeField("padding").options).toEqual([
      { id: "sm", label: "sm", cssVar: "var(--plumix-spacing-sm)" },
      { id: "lg", label: "Large", cssVar: "var(--plumix-spacing-lg)" },
    ]);
  });

  test("tokenOption returns a usable option for a stale id, labelled by the id", () => {
    expect(makeField("padding").tokenOption("gone")).toEqual({
      id: "gone",
      label: "gone",
      cssVar: "var(--plumix-spacing-gone)",
    });
  });

  test("resolves the category from the property, and flags color fields", () => {
    expect(makeField("padding").category).toBe("spacing");
    const color = makeField("color");
    expect(color.category).toBe("color");
    expect(color.isColor).toBe(true);
  });

  test("an explicit category overrides the property-derived one", () => {
    const field = makeField("background", { category: "spacing" });
    expect(field.category).toBe("spacing");
    expect(field.options.map((o) => o.id)).toEqual(["sm", "lg"]);
  });
});

describe("createStyleFields — theme-scoped builder", () => {
  test("builds fields for many properties from one bound token set", () => {
    const fields = createStyleFields(tokens);
    expect(fields.field("padding").category).toBe("spacing");
    expect(fields.field("color").category).toBe("color");
    expect(
      fields.field("fontFamily").write({ kind: "token", id: "serif" }),
    ).toBe("var(--plumix-font-family-serif, Georgia, serif)");
  });
});

describe("createStyleField — shares one var() grammar with the SSR emitter", () => {
  test("a token value written by the field emits unchanged through emitBlockStyleCss", () => {
    const stored = makeField("padding").write({ kind: "token", id: "lg" });
    expect(stored).toBe("var(--plumix-spacing-lg, 24px)");
    expect(emitBlockStyleCss("b", { large: { padding: stored ?? "" } })).toBe(
      ".b { padding: var(--plumix-spacing-lg, 24px); }",
    );
  });
});

import { Mark } from "@tiptap/core";
import { describe, expect, test } from "vitest";

import { defineMark } from "./define-mark.js";
import { MarkRegistrationError } from "./errors.js";

const STRONG_SCHEMA = () => Promise.resolve(Mark.create({ name: "bold" }));

const STRONG_COMPONENT = () =>
  Promise.resolve(({ children }: { children: unknown }) => children as never);

describe("defineMark", () => {
  test("returns a frozen spec on valid input", () => {
    const spec = defineMark({
      name: "bold",
      title: "Bold",
      schema: STRONG_SCHEMA,
      component: STRONG_COMPONENT,
    });
    expect(spec.name).toBe("bold");
    expect(spec.title).toBe("Bold");
    expect(Object.isFrozen(spec)).toBe(true);
  });

  test("rejects empty name", () => {
    expect(() =>
      defineMark({
        name: "",
        title: "Invalid",
        schema: STRONG_SCHEMA,
        component: STRONG_COMPONENT,
      }),
    ).toThrow(MarkRegistrationError);
  });

  test("rejects names with uppercase", () => {
    expect(() =>
      defineMark({
        name: "Bold",
        title: "Invalid",
        schema: STRONG_SCHEMA,
        component: STRONG_COMPONENT,
      }),
    ).toThrow(expect.objectContaining({ code: "invalid_name_pattern" }));
  });

  test("rejects names starting with a digit", () => {
    expect(() =>
      defineMark({
        name: "1bold",
        title: "Invalid",
        schema: STRONG_SCHEMA,
        component: STRONG_COMPONENT,
      }),
    ).toThrow(expect.objectContaining({ code: "invalid_name_pattern" }));
  });

  test("accepts hyphenated names (code, sub-script)", () => {
    expect(() =>
      defineMark({
        name: "code",
        title: "Inline code",
        schema: STRONG_SCHEMA,
        component: STRONG_COMPONENT,
      }),
    ).not.toThrow();
  });

  test("accepts namespaced plugin-style names (affiliate/link)", () => {
    expect(() =>
      defineMark({
        name: "affiliate/link",
        title: "Affiliate link",
        schema: STRONG_SCHEMA,
        component: STRONG_COMPONENT,
      }),
    ).not.toThrow();
  });
});

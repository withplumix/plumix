import { Node as TiptapNode } from "@tiptap/core";
import { describe, expect, test } from "vitest";

import { defineBlock } from "./define-block.js";
import { BlockRegistrationError } from "./errors.js";

const PARAGRAPH_SCHEMA = () =>
  Promise.resolve(
    TiptapNode.create({
      name: "core/paragraph",
      group: "block",
      content: "inline*",
    }),
  );

const PARAGRAPH_COMPONENT = () =>
  Promise.resolve(({ children }: { children: unknown }) => children as never);

describe("defineBlock", () => {
  test("returns a frozen spec on a valid input", () => {
    const spec = defineBlock({
      name: "core/paragraph",
      title: "Paragraph",
      schema: PARAGRAPH_SCHEMA,
      component: PARAGRAPH_COMPONENT,
    });

    expect(spec.name).toBe("core/paragraph");
    expect(spec.title).toBe("Paragraph");
    expect(Object.isFrozen(spec)).toBe(true);
  });

  test("rejects empty name", () => {
    expect(() =>
      defineBlock({
        name: "",
        title: "Invalid",
        schema: PARAGRAPH_SCHEMA,
        component: PARAGRAPH_COMPONENT,
      }),
    ).toThrow(BlockRegistrationError);
  });

  test("rejects name without namespace separator", () => {
    expect(() =>
      defineBlock({
        name: "paragraph",
        title: "Invalid",
        schema: PARAGRAPH_SCHEMA,
        component: PARAGRAPH_COMPONENT,
      }),
    ).toThrow(expect.objectContaining({ code: "invalid_name_pattern" }));
  });

  test("rejects name with uppercase characters", () => {
    expect(() =>
      defineBlock({
        name: "core/Paragraph",
        title: "Invalid",
        schema: PARAGRAPH_SCHEMA,
        component: PARAGRAPH_COMPONENT,
      }),
    ).toThrow(expect.objectContaining({ code: "invalid_name_pattern" }));
  });

  test("rejects namespace starting with a digit", () => {
    expect(() =>
      defineBlock({
        name: "1core/paragraph",
        title: "Invalid",
        schema: PARAGRAPH_SCHEMA,
        component: PARAGRAPH_COMPONENT,
      }),
    ).toThrow(expect.objectContaining({ code: "invalid_name_pattern" }));
  });

  test("accepts a name with hyphens in both segments", () => {
    const spec = defineBlock({
      name: "media-extra/full-bleed-image",
      title: "Full bleed image",
      schema: PARAGRAPH_SCHEMA,
      component: PARAGRAPH_COMPONENT,
    });
    expect(spec.name).toBe("media-extra/full-bleed-image");
  });

  test("freezes attribute schemas as well", () => {
    const spec = defineBlock({
      name: "core/paragraph",
      title: "Paragraph",
      attributes: {
        align: { type: "select", default: "left" },
      },
      schema: PARAGRAPH_SCHEMA,
      component: PARAGRAPH_COMPONENT,
    });
    expect(Object.isFrozen(spec.attributes)).toBe(true);
    expect(Object.isFrozen(spec.attributes?.align)).toBe(true);
  });
});

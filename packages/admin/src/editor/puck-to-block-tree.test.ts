import type { Data } from "@puckeditor/core";
import { describe, expect, test } from "vitest";

import { puckDataToBlockTree } from "./puck-to-block-tree.js";

function data(
  content: readonly { type: string; props: Record<string, unknown> }[],
): Data {
  return {
    content: content as Data["content"],
    root: { props: {} },
  };
}

describe("puckDataToBlockTree", () => {
  test("converts a flat Puck content array to BlockNode[]", () => {
    const result = puckDataToBlockTree(
      data([
        { type: "core/heading", props: { id: "h1", text: "Title", level: 2 } },
        { type: "core/paragraph", props: { id: "p1", text: "Body" } },
      ]),
    );

    expect(result).toEqual([
      {
        id: "h1",
        name: "core/heading",
        attrs: { id: "h1", text: "Title", level: 2 },
      },
      {
        id: "p1",
        name: "core/paragraph",
        attrs: { id: "p1", text: "Body" },
      },
    ]);
  });

  test("uses a fallback id when props.id is missing or empty", () => {
    const result = puckDataToBlockTree(
      data([
        { type: "core/heading", props: { text: "x" } },
        { type: "core/heading", props: { id: "", text: "y" } },
      ]),
    );

    expect(result[0]?.id).toBe("puck-0");
    expect(result[1]?.id).toBe("puck-1");
  });

  test("recurses into slot-typed nested {type, props} arrays inside props", () => {
    const result = puckDataToBlockTree(
      data([
        {
          type: "core/section",
          props: {
            id: "section",
            content: [
              {
                type: "core/heading",
                props: { id: "inner", text: "Inside", level: 1 },
              },
            ],
          },
        },
      ]),
    );

    expect(result).toEqual([
      {
        id: "section",
        name: "core/section",
        attrs: {
          id: "section",
          content: [
            {
              id: "inner",
              name: "core/heading",
              attrs: { id: "inner", text: "Inside", level: 1 },
            },
          ],
        },
      },
    ]);
  });

  test("recurses through multi-slot parents (e.g. columns with left + right)", () => {
    const result = puckDataToBlockTree(
      data([
        {
          type: "core/columns",
          props: {
            id: "cols",
            left: [
              {
                type: "core/heading",
                props: { id: "lh", text: "L", level: 2 },
              },
            ],
            right: [
              {
                type: "core/heading",
                props: { id: "rh", text: "R", level: 2 },
              },
            ],
          },
        },
      ]),
    );

    expect(Array.isArray(result[0]?.attrs?.left)).toBe(true);
    expect(Array.isArray(result[0]?.attrs?.right)).toBe(true);
    const left = result[0]?.attrs?.left as readonly { id: string }[];
    expect(left[0]?.id).toBe("lh");
  });

  test("walks slots arbitrarily deep without crashing", () => {
    const result = puckDataToBlockTree(
      data([
        {
          type: "a/outer",
          props: {
            id: "outer",
            content: [
              {
                type: "a/middle",
                props: {
                  id: "middle",
                  content: [
                    {
                      type: "a/inner",
                      props: { id: "inner", text: "deep" },
                    },
                  ],
                },
              },
            ],
          },
        },
      ]),
    );

    const outerContent = result[0]?.attrs?.content as readonly {
      attrs: Record<string, unknown>;
    }[];
    const middle = outerContent[0];
    expect(middle).toBeDefined();
    const inner = (middle?.attrs.content as readonly { id: string }[])[0];
    expect(inner?.id).toBe("inner");
  });

  test("elevates props.style to node.style (separate from attrs)", () => {
    const result = puckDataToBlockTree(
      data([
        {
          type: "core/heading",
          props: {
            id: "h1",
            text: "Title",
            style: { large: { padding: "md" } },
          },
        },
      ]),
    );

    expect(result[0]?.style).toEqual({ large: { padding: "md" } });
    expect((result[0]?.attrs as Record<string, unknown>).style).toBeUndefined();
  });

  test("omits node.style when props.style is absent", () => {
    const result = puckDataToBlockTree(
      data([{ type: "core/heading", props: { id: "h1", text: "Title" } }]),
    );
    expect(result[0]?.style).toBeUndefined();
  });

  test("drops malformed props.style (null, primitive, array) without polluting attrs", () => {
    const result = puckDataToBlockTree(
      data([
        { type: "core/heading", props: { id: "h1", style: null } },
        { type: "core/heading", props: { id: "h2", style: "foo" } },
        { type: "core/heading", props: { id: "h3", style: [] } },
      ]),
    );
    for (const node of result) {
      expect(node.style).toBeUndefined();
      expect((node.attrs as Record<string, unknown>).style).toBeUndefined();
    }
  });

  test("leaves non-slot arrays in attrs alone (does not false-positive on plain data lists)", () => {
    const result = puckDataToBlockTree(
      data([
        {
          type: "core/picker",
          props: {
            id: "p",
            tags: [{ value: "foo" }, { value: "bar" }],
          },
        },
      ]),
    );

    expect(result[0]?.attrs?.tags).toEqual([
      { value: "foo" },
      { value: "bar" },
    ]);
  });
});

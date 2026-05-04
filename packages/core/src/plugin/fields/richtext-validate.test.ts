import { describe, expect, test } from "vitest";

import {
  RichtextValidationError,
  walkRichtextDoc,
} from "./richtext-validate.js";

describe("walkRichtextDoc — implicit baseline", () => {
  test("doc / paragraph / text are always allowed without an explicit listing", () => {
    const validate = walkRichtextDoc({});
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
    };
    expect(validate(doc)).toBe(doc);
  });

  test("null and undefined pass through unchanged", () => {
    const validate = walkRichtextDoc({});
    expect(validate(null)).toBeNull();
    expect(validate(undefined)).toBeUndefined();
  });
});

describe("walkRichtextDoc — node allowlist", () => {
  test("accepts allowed nodes", () => {
    const validate = walkRichtextDoc({ nodes: ["heading"] });
    expect(() =>
      validate({
        type: "doc",
        content: [{ type: "heading", attrs: { level: 2 }, content: [] }],
      }),
    ).not.toThrow();
  });

  test("rejects a node outside the allowlist with a JSON-path pointer", () => {
    const validate = walkRichtextDoc({ nodes: ["heading"] });
    expect(() =>
      validate({
        type: "doc",
        content: [
          { type: "paragraph", content: [] },
          { type: "blockquote", content: [] },
        ],
      }),
    ).toThrow(RichtextValidationError);
    try {
      validate({
        type: "doc",
        content: [
          { type: "paragraph", content: [] },
          { type: "blockquote", content: [] },
        ],
      });
    } catch (error) {
      const err = error as RichtextValidationError;
      expect(err.reason).toBe("disallowed_node");
      expect(err.path).toBe(".content[1]");
      expect(err.message).toContain("blockquote");
    }
  });

  test("blocks contributes to the allowed node set (plugin-registered nodes)", () => {
    const validate = walkRichtextDoc({ blocks: ["my-callout"] });
    expect(() =>
      validate({
        type: "doc",
        content: [{ type: "my-callout", content: [] }],
      }),
    ).not.toThrow();
  });
});

describe("walkRichtextDoc — mark allowlist", () => {
  test("accepts allowed marks", () => {
    const validate = walkRichtextDoc({ marks: ["bold"] });
    expect(() =>
      validate({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "hi", marks: [{ type: "bold" }] }],
          },
        ],
      }),
    ).not.toThrow();
  });

  test("rejects a mark outside the allowlist with a JSON-path pointer", () => {
    const validate = walkRichtextDoc({ marks: ["bold"] });
    try {
      validate({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "hi",
                marks: [{ type: "bold" }, { type: "italic" }],
              },
            ],
          },
        ],
      });
    } catch (error) {
      const err = error as RichtextValidationError;
      expect(err.reason).toBe("disallowed_mark");
      expect(err.path).toBe(".content[0].content[0].marks[1]");
      expect(err.message).toContain("italic");
      return;
    }
    throw new Error("expected throw");
  });
});

describe("walkRichtextDoc — link href safety", () => {
  test("safe schemes pass through", () => {
    const validate = walkRichtextDoc({ marks: ["link"] });
    const safeHrefs = [
      "https://example.com",
      "http://example.com",
      "mailto:user@example.com",
      "tel:+15551234567",
      "/relative/path",
      "#fragment",
      "?query=string",
      "../up-one",
    ];
    for (const href of safeHrefs) {
      expect(() =>
        validate({
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "x",
                  marks: [{ type: "link", attrs: { href } }],
                },
              ],
            },
          ],
        }),
      ).not.toThrow();
    }
  });

  test("javascript: scheme rejected as unsafe_href", () => {
    const validate = walkRichtextDoc({ marks: ["link"] });
    try {
      validate({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "x",
                marks: [
                  { type: "link", attrs: { href: "javascript:alert(1)" } },
                ],
              },
            ],
          },
        ],
      });
    } catch (error) {
      const err = error as RichtextValidationError;
      expect(err.reason).toBe("unsafe_href");
      return;
    }
    throw new Error("expected throw");
  });

  test("data: scheme rejected", () => {
    const validate = walkRichtextDoc({ marks: ["link"] });
    expect(() =>
      validate({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "x",
                marks: [
                  { type: "link", attrs: { href: "data:text/html,<x>" } },
                ],
              },
            ],
          },
        ],
      }),
    ).toThrow(RichtextValidationError);
  });

  test("missing or empty href on a link mark passes (editor displays anchor without target)", () => {
    const validate = walkRichtextDoc({ marks: ["link"] });
    expect(() =>
      validate({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "x",
                marks: [{ type: "link", attrs: {} }],
              },
            ],
          },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      validate({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "x",
                marks: [{ type: "link", attrs: { href: "" } }],
              },
            ],
          },
        ],
      }),
    ).not.toThrow();
  });
});

describe("walkRichtextDoc — shape errors", () => {
  test("non-object root throws invalid_shape", () => {
    const validate = walkRichtextDoc({});
    expect(() => validate("not a doc")).toThrow(RichtextValidationError);
    expect(() => validate(42)).toThrow(RichtextValidationError);
  });

  test("array root throws invalid_shape", () => {
    const validate = walkRichtextDoc({});
    expect(() => validate([])).toThrow(RichtextValidationError);
  });

  test("missing type throws invalid_shape", () => {
    const validate = walkRichtextDoc({});
    expect(() => validate({})).toThrow(RichtextValidationError);
  });

  test("excessive nesting depth throws invalid_shape (stack-overflow protection)", () => {
    // Pathological 200-level nesting — pre-cap this would either work
    // (within JS stack budget) or blow up with a generic
    // RangeError. Post-cap it deterministically rejects with a
    // RichtextValidationError that points at the depth that tipped
    // over.
    const validate = walkRichtextDoc({ nodes: ["blockquote"] });
    interface DeepNode {
      type: string;
      content: DeepNode[];
    }
    let nested: DeepNode = { type: "paragraph", content: [] };
    for (let i = 0; i < 200; i++) {
      nested = { type: "blockquote", content: [nested] };
    }
    const root: DeepNode = { type: "doc", content: [nested] };
    expect(() => validate(root)).toThrow(RichtextValidationError);
    try {
      validate(root);
    } catch (error) {
      const err = error as RichtextValidationError;
      expect(err.reason).toBe("invalid_shape");
      expect(err.message).toContain("nesting exceeds");
    }
  });

  test("nesting just under the cap (50 levels) passes", () => {
    const validate = walkRichtextDoc({ nodes: ["blockquote"] });
    interface DeepNode {
      type: string;
      content: DeepNode[];
    }
    let nested: DeepNode = { type: "paragraph", content: [] };
    for (let i = 0; i < 50; i++) {
      nested = { type: "blockquote", content: [nested] };
    }
    const root: DeepNode = { type: "doc", content: [nested] };
    expect(() => validate(root)).not.toThrow();
  });
});

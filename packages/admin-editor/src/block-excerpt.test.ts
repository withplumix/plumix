import { describe, expect, test } from "vitest";

import type { BlockSpec } from "@plumix/core/blocks";

import { blockExcerpt } from "./block-excerpt.js";

const prose: BlockSpec = {
  name: "core/prose",
  render: () => null,
  title: "Text",
  text: [{ name: "body", html: true }],
};

describe("blockExcerpt", () => {
  test("reads a block's own text, to tell its row apart", () => {
    expect(
      blockExcerpt(
        {
          id: "p1",
          name: "core/prose",
          attrs: { body: "<h2>What we found</h2>" },
        },
        prose,
      ),
    ).toBe("What we found");
  });

  test("a block with no text has no excerpt", () => {
    expect(
      blockExcerpt(
        { id: "p1", name: "core/prose", attrs: { body: "" } },
        prose,
      ),
    ).toBeNull();
  });

  test("a long text is cut to the row with an ellipsis", () => {
    expect(
      blockExcerpt(
        {
          id: "p1",
          name: "core/prose",
          attrs: {
            body: "<p>Salt early, salt often, and taste everything before it reaches the plate</p>",
          },
        },
        prose,
      ),
    ).toBe("Salt early, salt often, and taste everything be…");
  });
});

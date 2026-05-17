import { describe, expect, test } from "vitest";

import { mockRegistry, renderBlock } from "../test/index.js";
import { descriptionDetailBlock } from "./description-detail.js";
import { descriptionTermBlock } from "./description-term.js";
import { descriptionListBlock } from "./index.js";

const REGISTRY = () =>
  mockRegistry({
    core: [descriptionListBlock, descriptionTermBlock, descriptionDetailBlock],
  });

describe("core/description-list", () => {
  test("renders <dl> wrapping term + detail children", async () => {
    const registry = await REGISTRY();
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/description-list",
            content: [
              {
                type: "core/description-term",
                content: [{ type: "text", text: "HTTP" }],
              },
              {
                type: "core/description-detail",
                content: [
                  { type: "text", text: "Hypertext Transfer Protocol" },
                ],
              },
            ],
          },
        ],
      },
    });
    expect(html).toBe(
      "<dl><dt>HTTP</dt><dd>Hypertext Transfer Protocol</dd></dl>",
    );
  });

  test("allows multiple term/detail pairs in any order", async () => {
    const registry = await REGISTRY();
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/description-list",
            content: [
              {
                type: "core/description-term",
                content: [{ type: "text", text: "A" }],
              },
              {
                type: "core/description-term",
                content: [{ type: "text", text: "B" }],
              },
              {
                type: "core/description-detail",
                content: [{ type: "text", text: "shared definition" }],
              },
            ],
          },
        ],
      },
    });
    expect(html).toBe(
      "<dl><dt>A</dt><dt>B</dt><dd>shared definition</dd></dl>",
    );
  });
});

describe("core/description-term", () => {
  test("renders as <dt>", async () => {
    const registry = await REGISTRY();
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/description-term",
            content: [{ type: "text", text: "Term" }],
          },
        ],
      },
    });
    expect(html).toBe("<dt>Term</dt>");
  });
});

describe("core/description-detail", () => {
  test("renders as <dd>", async () => {
    const registry = await REGISTRY();
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/description-detail",
            content: [{ type: "text", text: "Definition" }],
          },
        ],
      },
    });
    expect(html).toBe("<dd>Definition</dd>");
  });
});

import { describe, expect, test } from "vitest";

import type { BlockNode } from "../render-block-tree.js";
import { columnBlock } from "../column/index.js";
import { richTextBlock } from "../rich-text/index.js";
import { renderBlockTreeToHtml } from "../test/index.js";
import { columnsBlock } from "./index.js";

describe("core/columns", () => {
  test("renders its columns in a bare seam row (no legacy data markers)", () => {
    const tree: readonly BlockNode[] = [
      {
        id: "c1",
        name: "core/columns",
        attrs: {
          columns: [
            {
              id: "col-l",
              name: "core/column",
              attrs: {
                content: [
                  {
                    id: "p1",
                    name: "core/rich-text",
                    attrs: { body: "<p>L</p>" },
                  },
                ],
              },
            },
            {
              id: "col-r",
              name: "core/column",
              attrs: {
                content: [
                  {
                    id: "p2",
                    name: "core/rich-text",
                    attrs: { body: "<p>R</p>" },
                  },
                ],
              },
            },
          ],
        },
      },
    ];

    const html = renderBlockTreeToHtml(
      [columnsBlock, columnBlock, richTextBlock],
      tree,
    );

    expect(html).toContain("<p>L</p>");
    expect(html).toContain("<p>R</p>");
    expect(html).not.toContain("data-plumix-columns");
    expect(html).not.toContain("data-gap");
  });

  test("seeds a flex row with a gap", () => {
    expect(columnsBlock.defaultStyles?.large?.display).toBe("flex");
    expect(columnsBlock.defaultStyles?.large?.gap).toBe("20px");
  });

  test("stacks columns below the tablet breakpoint by default", () => {
    const tree: readonly BlockNode[] = [
      { id: "c1", name: "core/columns", attrs: {} },
    ];

    const html = renderBlockTreeToHtml([columnsBlock], tree);

    // Builder's stackColumnsAt default is 'tablet' — a scoped media query flips
    // the row to a column below the tablet breakpoint (991px default).
    expect(html).toContain("@media (max-width: 991px)");
    expect(html).toContain("flex-direction: column");
    expect(html).toContain("plumix-cols-c1");
  });

  test("stackAt=mobile stacks below the mobile breakpoint instead", () => {
    const tree: readonly BlockNode[] = [
      { id: "c1", name: "core/columns", attrs: { stackAt: "mobile" } },
    ];

    const html = renderBlockTreeToHtml([columnsBlock], tree);

    expect(html).toContain("@media (max-width: 640px)");
    expect(html).not.toContain("991px");
  });

  test("stackAt=never emits no stacking media query", () => {
    const tree: readonly BlockNode[] = [
      { id: "c1", name: "core/columns", attrs: { stackAt: "never" } },
    ];

    const html = renderBlockTreeToHtml([columnsBlock], tree);

    expect(html).not.toContain("@media");
    expect(html).not.toContain("flex-direction: column");
  });

  test("reverseWhenStacked stacks in reverse order", () => {
    const tree: readonly BlockNode[] = [
      {
        id: "c1",
        name: "core/columns",
        attrs: { reverseWhenStacked: true },
      },
    ];

    const html = renderBlockTreeToHtml([columnsBlock], tree);

    expect(html).toContain("flex-direction: column-reverse");
  });

  test("accepts only core/column children, seeding two by default", () => {
    const slot = columnsBlock.inputs?.find((i) => i.name === "columns");
    expect(slot?.allowedBlocks).toEqual(["core/column"]);
    const seeded = slot?.defaultChildren ?? [];
    expect(seeded.map((n) => n.name)).toEqual(["core/column", "core/column"]);
  });
});

import type { BlockNode } from "../render-block-tree.js";
import { describe, expect, test } from "vitest";

import { renderBlockSpecToHtml, renderBlockTreeToHtml } from "../test/index.js";
import {
  tableBlockV2,
  tableBodyRowBlockV2,
  tableCellBlockV2,
  tableHeaderCellBlockV2,
  tableHeaderRowBlockV2,
} from "./v2.js";

describe("core/table family v2", () => {
  test("renders an empty <table> with no striped/bordered attrs by default", () => {
    const html = renderBlockSpecToHtml(tableBlockV2, {});

    expect(html).toContain("<table>");
    expect(html).not.toContain("data-striped");
    expect(html).not.toContain("data-bordered");
  });

  test("renders striped + bordered when truthy", () => {
    const html = renderBlockSpecToHtml(tableBlockV2, {
      striped: true,
      bordered: true,
    });

    expect(html).toContain('data-striped="true"');
    expect(html).toContain('data-bordered="true"');
  });

  test("renders <th scope=col> for header-cell with align attr", () => {
    const html = renderBlockSpecToHtml(tableHeaderCellBlockV2, {
      text: "Name",
      align: "center",
    });

    expect(html).toContain('<th scope="col"');
    expect(html).toContain('data-align="center"');
    expect(html).toContain("Name");
  });

  test("renders <td> for body cells", () => {
    const html = renderBlockSpecToHtml(tableCellBlockV2, { text: "v1" });

    expect(html).toContain("<td");
    expect(html).toContain("v1");
  });

  test("renders a full table > header-row > th + body-row > td composition", () => {
    const tree: readonly BlockNode[] = [
      {
        id: "t1",
        name: "core/table",
        attrs: {
          rows: [
            {
              id: "hr",
              name: "core/table-header-row",
              attrs: {
                cells: [
                  {
                    id: "th1",
                    name: "core/table-header-cell",
                    attrs: { text: "Col 1" },
                  },
                ],
              },
            },
            {
              id: "br",
              name: "core/table-body-row",
              attrs: {
                cells: [
                  {
                    id: "td1",
                    name: "core/table-cell",
                    attrs: { text: "val 1" },
                  },
                ],
              },
            },
          ],
        },
      },
    ];

    const html = renderBlockTreeToHtml(
      [
        tableBlockV2,
        tableHeaderRowBlockV2,
        tableBodyRowBlockV2,
        tableHeaderCellBlockV2,
        tableCellBlockV2,
      ],
      tree,
    );

    expect(html).toContain("<table>");
    expect(html).toContain('<tr data-header=""');
    expect(html).toContain("<th");
    expect(html).toContain("Col 1");
    expect(html).toContain("val 1");
  });
});

import { describe, expect, test } from "vitest";

import { mockRegistry, renderBlock } from "../test/index.js";
import {
  tableBlock,
  tableBodyRowBlock,
  tableCellBlock,
  tableHeaderCellBlock,
  tableHeaderRowBlock,
} from "./index.js";

const TABLE_REGISTRY_INPUT = {
  core: [
    tableBlock,
    tableHeaderRowBlock,
    tableBodyRowBlock,
    tableHeaderCellBlock,
    tableCellBlock,
  ],
};

describe("core/table", () => {
  test("renders empty table as <table>", async () => {
    const registry = await mockRegistry(TABLE_REGISTRY_INPUT);
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [{ type: "core/table", content: [] }],
      },
    });
    expect(html).toBe('<table data-plumix-block="core/table"></table>');
  });

  test("renders header row with <th scope='col'> cells and body rows with <td>", async () => {
    const registry = await mockRegistry(TABLE_REGISTRY_INPUT);
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/table",
            content: [
              {
                type: "core/table-header-row",
                content: [
                  {
                    type: "core/table-header-cell",
                    content: [{ type: "text", text: "Name" }],
                  },
                  {
                    type: "core/table-header-cell",
                    content: [{ type: "text", text: "Role" }],
                  },
                ],
              },
              {
                type: "core/table-body-row",
                content: [
                  {
                    type: "core/table-cell",
                    content: [{ type: "text", text: "Ada" }],
                  },
                  {
                    type: "core/table-cell",
                    content: [{ type: "text", text: "Founder" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    expect(html).toContain('<th scope="col"');
    expect(html).toContain('data-plumix-block="core/table-header-cell"');
    expect(html).toContain("Name");
    expect(html).toContain("Role");
    expect(html).toContain('data-plumix-block="core/table-body-row"');
    expect(html).toContain("<td");
    expect(html).toContain("Ada");
    expect(html).toContain("Founder");
  });

  test("omits data-striped when the attr is false (no leaky empty attribute)", async () => {
    const registry = await mockRegistry(TABLE_REGISTRY_INPUT);
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/table",
            attrs: { striped: false, bordered: false },
            content: [],
          },
        ],
      },
    });
    expect(html).not.toContain("data-striped");
    expect(html).not.toContain("data-bordered");
  });

  test("exposes data-striped and data-bordered when attrs are set", async () => {
    const registry = await mockRegistry(TABLE_REGISTRY_INPUT);
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/table",
            attrs: { striped: true, bordered: true },
            content: [],
          },
        ],
      },
    });
    expect(html).toContain('data-striped="true"');
    expect(html).toContain('data-bordered="true"');
  });

  test("cell exposes data-align from its align attribute", async () => {
    const registry = await mockRegistry(TABLE_REGISTRY_INPUT);
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/table-cell",
            attrs: { align: "center" },
            content: [{ type: "text", text: "centred" }],
          },
        ],
      },
    });
    expect(html).toContain('data-align="center"');
    expect(html).toContain("centred");
  });

  test("rejects invalid align values rather than leaking them", async () => {
    const registry = await mockRegistry(TABLE_REGISTRY_INPUT);
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/table-cell",
            attrs: { align: "bogus" },
            content: [{ type: "text", text: "x" }],
          },
        ],
      },
    });
    expect(html).not.toContain("data-align");
    expect(html).toContain("x");
  });

  test("tableBlock + tableCellBlock declare attributes and supports", () => {
    expect(tableBlock.attributes?.striped).toMatchObject({ type: "boolean" });
    expect(tableBlock.attributes?.bordered).toMatchObject({ type: "boolean" });
    expect(tableCellBlock.attributes?.align).toMatchObject({
      type: "select",
      default: "left",
    });
    expect(tableBlock.supports?.color?.background).toBe(true);
  });
});

import { describe, expect, test } from "vitest";

import { defaultTestTheme } from "../../src/test/default-theme.js";
import { testSite } from "../../src/test/site.js";

const siteAllowingOnlyGroups = await testSite({
  config: { theme: { ...defaultTestTheme, allowedBlocks: ["core/group"] } },
});

describe("creating an entry on a theme that allows a set of blocks", () => {
  test("refuses a node of a block outside the set", async () => {
    const create = siteAllowingOnlyGroups.actingAs("author").rpc.entry.create({
      title: "Hello",
      slug: "hello",
      content: {
        version: "plumix.v2",
        blocks: [{ id: "p1", name: "core/rich-text", attrs: {} }],
      },
    });

    await expect(create).rejects.toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
      data: {
        issues: [expect.objectContaining({ code: "block_not_allowed" })],
      },
    });
  });
});

const siteWithoutCustomStyles = await testSite({
  config: { theme: { ...defaultTestTheme, allowCustomStyles: false } },
});

describe("creating an entry on a theme that refuses custom styles", () => {
  test("refuses a literal style value", async () => {
    const create = siteWithoutCustomStyles.actingAs("author").rpc.entry.create({
      title: "Hello",
      slug: "hello",
      content: {
        version: "plumix.v2",
        blocks: [
          {
            id: "p1",
            name: "core/rich-text",
            attrs: {},
            style: { large: { color: "#e11" } },
          },
        ],
      },
    });

    await expect(create).rejects.toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
      data: {
        issues: [
          expect.objectContaining({
            code: "style_not_allowed",
            property: "color",
          }),
        ],
      },
    });
  });

  test("creates a block holding its own defaultStyles", async () => {
    const content = {
      version: "plumix.v2" as const,
      blocks: [
        {
          id: "s1",
          name: "core/section",
          attrs: { content: [] },
          style: { large: { paddingLeft: "1.25rem" } },
        },
      ],
    };

    const created = await siteWithoutCustomStyles
      .actingAs("author")
      .rpc.entry.create({ title: "Hello", slug: "hello", content });

    expect(created.content).toEqual(content);
  });
});

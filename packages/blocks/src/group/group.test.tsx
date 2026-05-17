import { describe, expect, test } from "vitest";

import { mockRegistry, renderBlock } from "../test/index.js";
import { groupBlock } from "./index.js";

describe("core/group", () => {
  test("renders as a <div> wrapping children", async () => {
    const registry = await mockRegistry({
      core: [groupBlock],
    });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [{ type: "core/group", content: [] }],
      },
    });
    expect(html).toBe('<div data-plumix-block="core/group"></div>');
  });

  test.each(["flow", "flex-row", "flex-column", "grid"])(
    "exposes layout=%s as data-layout",
    async (layout) => {
      const registry = await mockRegistry({
        core: [groupBlock],
      });
      const html = renderBlock({
        registry,
        content: {
          type: "doc",
          content: [{ type: "core/group", attrs: { layout }, content: [] }],
        },
      });
      expect(html).toBe(
        `<div data-plumix-block="core/group" data-layout="${layout}"></div>`,
      );
    },
  );

  test("omits data-layout when layout attr is absent", async () => {
    const registry = await mockRegistry({
      core: [groupBlock],
    });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [{ type: "core/group", content: [] }],
      },
    });
    expect(html).not.toContain("data-layout");
  });

  test("ignores unknown layout values rather than leaking them", async () => {
    const registry = await mockRegistry({
      core: [groupBlock],
    });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          { type: "core/group", attrs: { layout: "spinny" }, content: [] },
        ],
      },
    });
    expect(html).not.toContain("data-layout");
  });

  test("groupBlock declares Row + Stack variations presetting layout", () => {
    const slugs = (groupBlock.variations ?? []).map((v) => v.name);
    expect(slugs).toEqual(["row", "stack"]);
    const row = groupBlock.variations?.find((v) => v.name === "row");
    expect(row?.attributes).toEqual({ layout: "flex-row" });
    const stack = groupBlock.variations?.find((v) => v.name === "stack");
    expect(stack?.attributes).toEqual({ layout: "flex-column" });
  });

  test("groupBlock declares a `layout` select attribute with the four canonical options", () => {
    expect(groupBlock.attributes?.layout).toMatchObject({
      type: "select",
      default: "flow",
    });
    const options = (groupBlock.attributes?.layout?.options ?? []) as {
      value: string;
    }[];
    expect(options.map((o) => o.value)).toEqual([
      "flow",
      "flex-row",
      "flex-column",
      "grid",
    ]);
  });
});

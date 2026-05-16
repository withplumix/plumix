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
});

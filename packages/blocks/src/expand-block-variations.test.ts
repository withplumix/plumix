import { describe, expect, test } from "vitest";

import type { BlockSpec } from "./block-registry.js";
import { expandBlockVariations } from "./expand-block-variations.js";

function block(spec: Partial<BlockSpec> & { name: string }): BlockSpec {
  return { render: () => null, ...spec };
}

describe("expandBlockVariations", () => {
  test("emits one entry per variation when a block declares variations, dropping the parent entry", () => {
    const entries = expandBlockVariations([
      block({
        name: "core/list",
        title: "List",
        icon: "List",
        category: "text",
        variations: [
          {
            slug: "bullet",
            title: "Bulleted list",
            icon: "List",
            attrs: { variant: "bullet" },
          },
          {
            slug: "numbered",
            title: "Numbered list",
            icon: "ListOrdered",
            attrs: { variant: "numbered" },
          },
        ],
      }),
    ]);
    expect(entries.map((e) => e.slug)).toEqual(["bullet", "numbered"]);
    expect(entries.every((e) => e.name === "core/list")).toBe(true);
    expect(entries[0]?.attrs).toEqual({ variant: "bullet" });
    expect(entries[1]?.attrs).toEqual({ variant: "numbered" });
    expect(entries[0]?.icon).toBe("List");
    expect(entries[1]?.icon).toBe("ListOrdered");
    expect(entries.every((e) => e.category === "text")).toBe(true);
  });

  test("emits one entry per registered block when no variations declared", () => {
    const entries = expandBlockVariations([
      block({ name: "core/paragraph", title: "Paragraph" }),
      block({ name: "core/heading", title: "Heading" }),
    ]);
    expect(entries.map((e) => e.name)).toEqual([
      "core/paragraph",
      "core/heading",
    ]);
    expect(entries.map((e) => e.slug)).toEqual([
      "core/paragraph",
      "core/heading",
    ]);
  });
});

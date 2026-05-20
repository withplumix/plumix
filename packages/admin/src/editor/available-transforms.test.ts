import { describe, expect, test } from "vitest";

import type { BlockSpec } from "@plumix/blocks";
import { createBlockRegistry } from "@plumix/blocks";

import { availableTransforms } from "./available-transforms.js";

function spec(partial: Partial<BlockSpec> & { name: string }): BlockSpec {
  return { render: () => null, ...partial };
}

describe("availableTransforms", () => {
  test("returns an empty array when the source spec declares no transforms", () => {
    const registry = createBlockRegistry([
      spec({ name: "core/spacer", title: "Spacer" }),
      spec({ name: "core/heading", title: "Heading" }),
    ]);

    expect(availableTransforms("core/spacer", registry)).toEqual([]);
  });

  test("omits targets whose specs aren't present in the registry", () => {
    const registry = createBlockRegistry([
      spec({
        name: "core/paragraph",
        title: "Paragraph",
        transforms: {
          priority: 50,
          to: [{ target: "core/heading" }, { target: "core/ghost-missing" }],
        },
      }),
      spec({ name: "core/heading", title: "Heading" }),
    ]);

    const options = availableTransforms("core/paragraph", registry);

    expect(options.map((o) => o.targetName)).toEqual(["core/heading"]);
  });

  test("returns the resolved transforms with titles pulled from registry specs", () => {
    const registry = createBlockRegistry([
      spec({
        name: "core/paragraph",
        title: "Paragraph",
        transforms: {
          priority: 50,
          to: [
            {
              target: "core/heading",
              mapAttrs: (a) => ({ level: 2, text: a.text }),
            },
            {
              target: "core/quote",
              mapAttrs: (a) => ({ text: a.text, citation: "" }),
            },
          ],
        },
      }),
      spec({ name: "core/heading", title: "Heading" }),
      spec({ name: "core/quote", title: "Quote" }),
    ]);

    const options = availableTransforms("core/paragraph", registry);

    expect(options.map((o) => o.targetName).sort()).toEqual([
      "core/heading",
      "core/quote",
    ]);
    expect(
      options.find((o) => o.targetName === "core/heading")?.targetTitle,
    ).toBe("Heading");
  });
});

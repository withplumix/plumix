import type { JSX, ReactNode } from "react";
import { createElement } from "react";

import { defineBlock } from "../block-registry.js";

// Proving-ground conversion to MessageDescriptor literals. Admin's
// adapter resolves `Label` slots via `resolveLabel(label, i18n)` at
// adapter-construction time; locale changes reload the route so a single
// resolution per route-module evaluation is sufficient. Catalog extraction
// from `@plumix/blocks` is a follow-up — until wired, ids fall back to
// `descriptor.message` in every locale. Other core blocks remain on plain
// strings until they need to translate.
export const headingBlock = defineBlock({
  name: "core/heading",
  title: { id: "block.core.heading.title", message: "Heading" },
  icon: "Heading",
  category: "text",
  // Carry the seam on the <hN> itself so a block style class beats the theme's
  // explicit heading color (an inherited color from a wrapper div would lose).
  selfSeam: true,
  inputs: [
    {
      name: "text",
      type: "text",
      label: { id: "block.core.heading.input.text", message: "Text" },
    },
    {
      name: "level",
      type: "select",
      label: { id: "block.core.heading.input.level", message: "Level" },
      options: [
        { label: "H1", value: 1 },
        { label: "H2", value: 2 },
        { label: "H3", value: 3 },
        { label: "H4", value: 4 },
        { label: "H5", value: 5 },
        { label: "H6", value: 6 },
      ],
    },
  ],
  defaults: { level: 2, text: "" },
  render: ({ attrs, blockProps }): ReactNode => {
    const { level: rawLevel, text = "" } = attrs as {
      readonly level?: unknown;
      readonly text?: string;
    };
    const level =
      typeof rawLevel === "number" &&
      Number.isInteger(rawLevel) &&
      rawLevel >= 1 &&
      rawLevel <= 6
        ? rawLevel
        : 2;
    const tag = `h${level}` as keyof JSX.IntrinsicElements;
    return createElement(tag, blockProps, text);
  },
});

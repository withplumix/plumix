import type { ReactNode } from "react";

import { defineBlock } from "../block-registry.js";

export const listBlock = defineBlock({
  name: "core/list",
  title: "List",
  icon: "List",
  category: "text",
  inputs: [
    {
      name: "variant",
      type: "select",
      label: "Style",
      options: [
        { label: "Bulleted", value: "bullet" },
        { label: "Numbered", value: "numbered" },
      ],
    },
    { name: "start", type: "number", label: "Start" },
    { name: "items", type: "slot", label: "Items" },
  ],
  defaults: { variant: "bullet" },
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
  render: ({ attrs }): ReactNode => {
    const Items = attrs.items as (() => ReactNode) | undefined;
    if (attrs.variant === "numbered") {
      const startRaw = attrs.start;
      // Drop start when it equals the canonical default of 1 — matches the
      // legacy walker, which omits the attribute so the rendered HTML stays
      // identical to the implicit <ol>.
      const start =
        typeof startRaw === "number" && Number.isInteger(startRaw) && startRaw > 1
          ? startRaw
          : undefined;
      return <ol start={start}>{Items ? <Items /> : null}</ol>;
    }
    return <ul>{Items ? <Items /> : null}</ul>;
  },
});

export const listItemBlock = defineBlock({
  name: "core/list-item",
  title: "List item",
  category: "text",
  inline: true,
  inserter: false,
  inputs: [{ name: "text", type: "text", label: "Item" }],
  defaults: { text: "" },
  render: ({ attrs }): ReactNode => {
    const { text = "" } = attrs as { readonly text?: string };
    return <li>{text}</li>;
  },
});

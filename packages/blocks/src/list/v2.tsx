import type { ReactNode } from "react";

import { defineBlock } from "../block-registry.js";

export const listBlockV2 = defineBlock({
  name: "core/list",
  title: "Bulleted list",
  icon: "List",
  category: "text",
  inputs: [{ name: "items", type: "slot", label: "Items" }],
  defaults: {},
  render: ({ attrs }): ReactNode => {
    const Items = attrs.items as (() => ReactNode) | undefined;
    return <ul>{Items ? <Items /> : null}</ul>;
  },
});

export const listOrderedBlockV2 = defineBlock({
  name: "core/list-ordered",
  title: "Numbered list",
  icon: "ListOrdered",
  category: "text",
  inputs: [
    { name: "start", type: "number", label: "Start" },
    { name: "items", type: "slot", label: "Items" },
  ],
  defaults: {},
  render: ({ attrs }): ReactNode => {
    const startRaw = attrs.start as number | undefined;
    // Drop start when it equals the canonical default of 1 — matches the
    // legacy walker, which omits the attribute so the rendered HTML stays
    // identical to the implicit <ol>.
    const start =
      typeof startRaw === "number" && Number.isInteger(startRaw) && startRaw > 1
        ? startRaw
        : undefined;
    const Items = attrs.items as (() => ReactNode) | undefined;
    return <ol start={start}>{Items ? <Items /> : null}</ol>;
  },
});

export const listItemBlockV2 = defineBlock({
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

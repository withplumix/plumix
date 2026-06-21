import type { BlockNode } from "@plumix/blocks";

/**
 * A representative tree for the playground: top-level blocks plus nested and
 * multi-slot containers (group, columns, buttons) so selection, the floating
 * toolbar, multi-select, and nested structure all have something to act on
 * without a backend.
 */
export const SEED_BLOCKS: readonly BlockNode[] = [
  {
    id: "heading-1",
    name: "core/heading",
    attrs: { level: 1, text: "Plumix editor playground" },
  },
  {
    id: "intro",
    name: "core/rich-text",
    attrs: {
      body: "<p>A standalone harness for the bespoke editor — no worker, no orpc. Click a block to select it, shift-click to multi-select.</p>",
    },
  },
  {
    id: "group-1",
    name: "core/group",
    attrs: {
      content: [
        {
          id: "group-heading",
          name: "core/heading",
          attrs: { level: 2, text: "A nested group" },
        },
        {
          id: "group-text",
          name: "core/rich-text",
          attrs: { body: "<p>Blocks at any depth are selectable.</p>" },
        },
      ],
    },
  },
  {
    id: "columns-1",
    name: "core/columns",
    attrs: {
      left: [
        {
          id: "col-left",
          name: "core/rich-text",
          attrs: { body: "<p>Left column.</p>" },
        },
      ],
      right: [
        {
          id: "col-right",
          name: "core/rich-text",
          attrs: { body: "<p>Right column.</p>" },
        },
      ],
    },
  },
  {
    id: "buttons-1",
    name: "core/buttons",
    attrs: {
      items: [
        { id: "btn-1", name: "core/button", attrs: { label: "Primary" } },
        {
          id: "btn-2",
          name: "core/button",
          attrs: { label: "Secondary", variant: "secondary" },
        },
      ],
    },
  },
];

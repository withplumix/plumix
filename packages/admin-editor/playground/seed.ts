import type { BlockNode } from "@plumix/blocks";

import type { InserterPattern } from "../src/block-catalog.js";
import { FEED_SEED } from "./feed-block.js";

/**
 * A representative tree for the playground: top-level blocks plus nested and
 * multi-slot containers (group, columns, buttons) so selection, the floating
 * toolbar, multi-select, and nested structure all have something to act on
 * without a backend.
 */
export const SEED_BLOCKS: readonly BlockNode[] = [
  {
    id: "heading-1",
    name: "core/rich-text",
    attrs: { body: "<h1>Plumix editor playground</h1>" },
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
          name: "core/rich-text",
          attrs: { body: "<h2>A nested group</h2>" },
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
    id: "button-group-1",
    name: "core/group",
    attrs: {
      layout: "flex-row",
      content: [
        { id: "btn-1", name: "core/button", attrs: { label: "Primary" } },
        {
          id: "btn-2",
          name: "core/button",
          attrs: { label: "Secondary", variant: "secondary" },
        },
      ],
    },
  },
  FEED_SEED,
];

/**
 * Inserter patterns for the harness — a multi-block "Hero" composition the
 * catalog can splice in one click, so the patterns section (and its top-level
 * insert) has something real to exercise without a manifest.
 */
export const SEED_PATTERNS: readonly InserterPattern[] = [
  {
    name: "starter/hero",
    title: "Hero section",
    keywords: ["banner", "intro"],
    content: [
      {
        id: "hero-heading",
        name: "core/rich-text",
        attrs: { body: "<h1>Build anything</h1>" },
      },
      {
        id: "hero-text",
        name: "core/rich-text",
        attrs: { body: "<p>A two-block hero, inserted as one pattern.</p>" },
      },
    ],
  },
];

import type { EntryData } from "plumix";
import type { ReactNode } from "react";
import { createElement as h } from "react";
import { defineTemplate, defineTheme, entry, fallback } from "plumix";
import { BlockRenderer } from "plumix/blocks/renderer";

// Minimal page template that puts the entry's blocks on the page — the
// only way the form block's markup reaches a visitor, and so the only
// way the e2e suite can drive the real thing. Authored with
// `createElement` (no JSX) so the theme stays transform-agnostic across
// the jiti config load and the vite worker bundle.
const page = defineTemplate<EntryData>({
  render: ({ data }): ReactNode =>
    h(
      "main",
      null,
      h("h1", { "data-testid": "page-title" }, data.entry.title),
      data.entry.contentBlocks
        ? h(BlockRenderer, { content: data.entry.contentBlocks })
        : null,
    ),
});

export const theme = defineTheme({
  templates: [fallback(() => null), entry(page)],
});

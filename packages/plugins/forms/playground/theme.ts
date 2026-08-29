import type { EntryData } from "plumix";
import type { ReactNode } from "react";
import { createElement as h } from "react";
import { defineTemplate, defineTheme, entry, fallback } from "plumix";
import { BlockRenderer } from "plumix/blocks/renderer";

import { formWire, PlumixForm } from "@plumix/plugin-forms/theme";

import { SubscribeBar } from "./subscribe-bar.js";

// Minimal page template that puts the entry's blocks on the page — the
// only way the form block's markup reaches a visitor, and so the only
// way the e2e suite can drive the real thing. Authored with
// `createElement` (no JSX) so the theme stays transform-agnostic across
// the jiti config load and the vite worker bundle.
//
// It also carries the plugin's two theme-facing surfaces: a form dropped
// straight into the template on the one page seeded without a block, and
// the site-wide subscribe bar, which is the theme's own markup driven by
// the headless hook.
const page = defineTemplate<EntryData>({
  render: ({ data }): ReactNode => {
    const subscribe = formWire("subscribe");
    return h(
      "main",
      null,
      h("h1", { "data-testid": "page-title" }, data.entry.title),
      data.entry.slug === "templated"
        ? h(PlumixForm, { slug: "contact", id: "templated" })
        : null,
      data.entry.contentBlocks
        ? h(BlockRenderer, { content: data.entry.contentBlocks })
        : null,
      subscribe === undefined
        ? null
        : h(SubscribeBar, { client: "load", form: subscribe }),
    );
  },
});

export const theme = defineTheme({
  templates: [fallback(() => null), entry(page)],
});

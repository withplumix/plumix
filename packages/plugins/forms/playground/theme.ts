import type { EntryData } from "plumix/theme";
import type { ReactNode } from "react";
import { createElement as h } from "react";
import { BlockRenderer } from "plumix/blocks/renderer";
import { defineTemplate, defineTheme, entry, fallback } from "plumix/theme";

import { formWire, PlumixForm } from "@plumix/plugin-forms/theme";

import { SubscribeBar } from "./subscribe-bar.js";

/**
 * Renders entry blocks, a template-rendered form and the subscribe bar. Uses
 * `createElement`, not JSX, to stay transform-agnostic across jiti and the vite
 * worker bundle.
 */
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

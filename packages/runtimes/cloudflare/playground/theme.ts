import type { EntryData } from "plumix";
import type { ReactNode } from "react";
import { createElement as h } from "react";
import { defineTemplate, defineTheme, entry, fallback } from "plumix";

// The smallest theme the shared runtime spec can read a published entry
// through: one single-entry template that renders the title. Authored with
// `createElement` (no JSX) so it stays transform-agnostic across the jiti
// config load and the vite worker bundle.
const single = defineTemplate<EntryData>({
  render: ({ data }): ReactNode =>
    h("main", null, h("h1", { "data-testid": "post-title" }, data.entry.title)),
});

export const theme = defineTheme({
  templates: [fallback(() => null), entry(single)],
});

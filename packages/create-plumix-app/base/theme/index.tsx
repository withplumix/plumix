import type { SingleData, TemplateData } from "plumix";
import * as React from "react";
import { defineTemplate, defineTheme } from "plumix";

const wrap = { maxWidth: "40rem", margin: "4rem auto", padding: "0 1rem" };

// The universal listing / fallback template (front page, archives, search).
// A blank project has no content plugins yet, so this greets you until you
// add one and bring your own markup.
const index = defineTemplate<TemplateData>({
  render: () => (
    <main style={wrap}>
      <h1>Your Plumix site is running</h1>
      <p>
        Edit <code>theme/index.tsx</code> to build your home page. Add a content
        plugin (blog, pages) and its entries render through the{" "}
        <code>single</code> template below.
      </p>
      <p>
        <a href="/_plumix/admin">Open the admin →</a>
      </p>
    </main>
  ),
});

// Generic single-entry template: renders any content plugin's entry. Copy it
// into dedicated `single` / `page` templates for richer, per-type layouts.
const single = defineTemplate<SingleData>({
  render: ({ data }) => (
    <main style={wrap}>
      <article>
        <h1>{data.entry.title}</h1>
        {data.entry.excerpt ? <p>{data.entry.excerpt}</p> : null}
      </article>
    </main>
  ),
});

export const theme = defineTheme({
  templates: { index, single, page: single },
  document: {
    titleTemplate: (title) => (title ? `${title} — Plumix` : "Plumix"),
  },
});

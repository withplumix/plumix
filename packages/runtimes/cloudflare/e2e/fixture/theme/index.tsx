import type { TemplateData } from "plumix";
import * as React from "react";
import { defineTemplate, defineTheme } from "plumix";

// A single `index` template renders every route. It carries the "Try the
// editor" CTA the e2e clicks to enter the demo funnel, plus the seeded post
// list so the public showcase has content.
const index = defineTemplate<TemplateData>({
  render: ({ data }) => (
    <main data-testid="showcase">
      <h1>Plumix Demo</h1>
      <a href="/demo" data-testid="try-editor">
        Try the editor
      </a>
      <ul data-testid="post-list">
        {"entries" in data
          ? data.entries.map((entry) => (
              <li key={entry.id} data-testid="post-card">
                {entry.title}
              </li>
            ))
          : null}
      </ul>
    </main>
  ),
});

export const demoTheme = defineTheme({ templates: { index } });

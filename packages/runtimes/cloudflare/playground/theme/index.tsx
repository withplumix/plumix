import type { TemplateData } from "plumix";
import * as React from "react";
import { defineTemplate, defineTheme } from "plumix";

import { hasDemoSession } from "@plumix/runtime-cloudflare/demo";

// A single `index` template renders every route. It carries the "Try the
// editor" CTA the e2e clicks to enter the demo funnel, plus the seeded post
// list so the public showcase has content. The CTA shows only for anonymous
// visitors — once a demo session cookie exists (public site or the editor's
// same-origin preview) it's hidden.
const index = defineTemplate<TemplateData>({
  render: ({ data, ctx }) => (
    <main data-testid="showcase">
      <h1>Plumix Demo</h1>
      {!hasDemoSession(ctx.request) && (
        <a href="/demo" data-testid="try-editor">
          Try the editor
        </a>
      )}
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

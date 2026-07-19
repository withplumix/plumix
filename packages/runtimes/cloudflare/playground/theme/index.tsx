import type { SingleData, TemplateData } from "plumix";
import * as React from "react";
import { defineTemplate, defineTheme } from "plumix";

import { BlockRenderer } from "@plumix/blocks/renderer";
import { hasDemoSession } from "@plumix/runtime-cloudflare/demo";

// The showcase (list routes). Carries the "Try the editor" CTA the e2e clicks
// to enter the demo funnel, plus the seeded post list so the public showcase
// has content. The CTA shows only for anonymous visitors — once a demo session
// cookie exists (public site or the editor's same-origin preview) it's hidden.
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

// A single-entry template renders the entry's block content through the real
// `BlockRenderer`, so the editor canvas (which loads this route with
// `?plumix.edit`) has tagged, selectable blocks — the surface the demo e2e
// drives to prove the visual editor boots in the demo runtime.
const single = defineTemplate<SingleData>({
  render: ({ data }) => (
    <main data-testid="single">
      <h1>{data.entry.title}</h1>
      {data.entry.contentBlocks ? (
        <BlockRenderer content={data.entry.contentBlocks} />
      ) : null}
    </main>
  ),
});

export const demoTheme = defineTheme({ templates: { index, single } });

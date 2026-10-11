import type { EntryData } from "plumix/theme";
import type { ReactNode } from "react";
import { createElement as h } from "react";
import { defineTemplate, defineTheme, entry, fallback } from "plumix/theme";

// Importing the result type also pulls the plugin's `TemplateDepRegistry`
// augmentation, so `comments` is typed on the render args below.
import type { ResolvedThreadPage } from "@plumix/plugin-comments/server";
import {
  PlumixCommentForm,
  PlumixCommentThread,
} from "@plumix/plugin-comments/theme";

/**
 * `createElement` rather than JSX keeps the theme transform-agnostic across
 * the jiti config load and the vite worker bundle.
 */
const single = defineTemplate<EntryData>({
  comments: ["current"],
  render: ({ data, comments }): ReactNode => {
    const thread: ResolvedThreadPage | null = comments?.current ?? null;
    return h(
      "main",
      null,
      h("h1", { "data-testid": "post-title" }, data.entry.title),
      h(
        "section",
        { "data-testid": "comments" },
        h(
          "p",
          { "data-testid": "comments-count" },
          `${String(thread?.count ?? 0)} comments`,
        ),
        h(
          "div",
          { "data-testid": "comments-list" },
          h(PlumixCommentThread, { thread }),
        ),
        h(PlumixCommentForm, { entryId: data.entry.id }),
      ),
    );
  },
});

export const theme = defineTheme({
  templates: [fallback(() => null), entry(single)],
});

import type { EntryData } from "plumix/theme";
import type { ReactNode } from "react";
import { createElement as h } from "react";
import { defineTemplate, defineTheme, entry, fallback } from "plumix/theme";

// Importing the result type also pulls the plugin's `TemplateDepRegistry`
// augmentation, so `comments` is typed on the render args below.
import type { ResolvedThread } from "@plumix/plugin-comments/server";
// The plugin's own form, dogfooded: server-rendered markup that posts
// without a line of JavaScript, upgraded in place by the island where
// there is some. The `without JavaScript` e2e drives exactly this.
import { PlumixCommentForm } from "@plumix/plugin-comments/theme";

import { commentItem } from "./comment-item.js";
import { OlderComments } from "./older-comments.js";

// Minimal single-post template that renders the approved comment thread
// the `comments` template dep resolves for the current entry, recursing
// into nested replies. Authored with `createElement` (no JSX) so the
// first real plumix theme stays transform-agnostic across jiti config
// load + the vite worker bundle.
const single = defineTemplate<EntryData>({
  comments: ["current"],
  render: ({ data, comments }): ReactNode => {
    const thread: ResolvedThread | null = comments?.current ?? null;
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
          "ul",
          { "data-testid": "comments-list" },
          (thread?.comments ?? []).map(commentItem),
        ),
        // Only the older pages are the island's: the first page stays
        // server-rendered above, rather than re-serialized into its props.
        thread?.hasMore
          ? h(OlderComments, {
              client: "visible",
              entryId: thread.entryId,
              cursor: thread.nextCursor,
            })
          : null,
        h(PlumixCommentForm, { entryId: data.entry.id }),
      ),
    );
  },
});

export const theme = defineTheme({
  templates: [fallback(() => null), entry(single)],
});

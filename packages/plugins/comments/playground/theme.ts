import type { SingleData } from "plumix";
import type { ReactNode } from "react";
import { createElement as h } from "react";
import { defineTemplate, defineTheme } from "plumix";

// Importing the result type also pulls the plugin's `TemplateDepRegistry`
// augmentation, so `comments` is typed on the render args below.
import type { ResolvedThread } from "@plumix/plugin-comments/server";

// Minimal single-post template that renders the approved comment thread
// the `comments` template dep resolves for the current entry, recursing
// into nested replies. Authored with `createElement` (no JSX) so the
// first real plumix theme stays transform-agnostic across jiti config
// load + the vite worker bundle.
type ThreadComment = ResolvedThread["comments"][number];

function commentItem(comment: ThreadComment): ReactNode {
  return h(
    "li",
    { key: comment.id, "data-testid": `comment-item-${String(comment.id)}` },
    h("img", {
      "data-testid": "comment-avatar",
      src: comment.avatarUrl,
      alt: "",
      width: 48,
      height: 48,
    }),
    h("span", { "data-testid": "comment-author" }, comment.authorName),
    h("div", {
      "data-testid": "comment-body",
      dangerouslySetInnerHTML: { __html: comment.bodyHtml },
    }),
    comment.replies.length > 0
      ? h(
          "ul",
          { "data-testid": "comment-replies" },
          comment.replies.map(commentItem),
        )
      : null,
  );
}

const single = defineTemplate<SingleData>({
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
      ),
    );
  },
});

export const theme = defineTheme({
  templates: {
    index: () => null,
    single,
  },
});

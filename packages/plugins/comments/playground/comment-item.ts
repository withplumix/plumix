import type { ReactNode } from "react";
import { createElement as h } from "react";

import type { ResolvedComment } from "@plumix/plugin-comments/hooks";

/**
 * Its own module so the island doesn't pull `defineTheme` into the browser.
 * `bodyHtml` is sanitized server-side (markdown-it `html:false`); never feed
 * the sink raw `bodyMd`.
 */
export function commentItem(comment: ResolvedComment): ReactNode {
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

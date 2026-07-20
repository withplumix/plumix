import type { EntryData } from "plumix";
import type { ReactNode } from "react";
import { createElement as h } from "react";
import { defineTemplate, defineTheme, entry, fallback } from "plumix";

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

// Progressive-enhancement "load more": fetches the next root page from
// the plugin's public GET route and appends it, building the same markup
// `commentItem` renders server-side so appended nodes match. Shipped
// inline because the playground has no client bundler; a real theme would
// author this in its own client entry. `bodyHtml` is sanitized
// server-side (markdown-it `html:false`), so the `innerHTML` sink carries
// the same trust boundary as the SSR `dangerouslySetInnerHTML` — never
// feed this raw `bodyMd`.
const LOAD_MORE_SCRIPT = `
(function () {
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }
  function item(c) {
    var li = el("li", { "data-testid": "comment-item-" + c.id });
    li.appendChild(el("img", { "data-testid": "comment-avatar", src: c.avatarUrl, alt: "", width: "48", height: "48" }));
    li.appendChild(el("span", { "data-testid": "comment-author" }, [document.createTextNode(c.authorName)]));
    var body = el("div", { "data-testid": "comment-body" });
    body.innerHTML = c.bodyHtml;
    li.appendChild(body);
    if (c.replies && c.replies.length) {
      li.appendChild(el("ul", { "data-testid": "comment-replies" }, c.replies.map(item)));
    }
    return li;
  }
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("[data-testid='comments-load-more']");
    if (!btn) return;
    btn.disabled = true;
    var entryId = btn.getAttribute("data-entry-id");
    var cursor = btn.getAttribute("data-cursor");
    var url = "/_plumix/comments/list?entryId=" + encodeURIComponent(entryId) +
      (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");
    fetch(url, { headers: { accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r); })
      .then(function (page) {
        var list = document.querySelector("[data-testid='comments-list']");
        page.comments.forEach(function (c) { list.appendChild(item(c)); });
        if (page.hasMore && page.nextCursor) {
          btn.setAttribute("data-cursor", page.nextCursor);
          btn.disabled = false;
        } else {
          btn.remove();
        }
      })
      .catch(function () { btn.disabled = false; });
  });
})();
`;

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
        thread?.hasMore
          ? h(
              "button",
              {
                "data-testid": "comments-load-more",
                "data-entry-id": String(thread.entryId),
                "data-cursor": thread.nextCursor ?? "",
              },
              "Load more comments",
            )
          : null,
        thread?.hasMore
          ? h("script", {
              dangerouslySetInnerHTML: { __html: LOAD_MORE_SCRIPT },
            })
          : null,
      ),
    );
  },
});

export const theme = defineTheme({
  templates: [fallback(() => null), entry(single)],
});

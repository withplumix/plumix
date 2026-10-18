import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { ResolvedComment } from "../server/load-thread.js";
import { CommentItem } from "./comment-item.js";

function resolvedComment(
  overrides: Partial<ResolvedComment> = {},
): ResolvedComment {
  return {
    id: 1,
    authorName: "Ada",
    isRegistered: false,
    avatarUrl: "https://cms.example/avatar.png",
    bodyHtml: "<p>First</p>",
    createdAt: new Date("2026-03-04T21:30:00.000Z"),
    replies: [],
    ...overrides,
  };
}

const render = (comment: ResolvedComment): string =>
  renderToStaticMarkup(<CommentItem comment={comment} />);

describe("CommentItem", () => {
  test("carries an anchor named after the comment's id", () => {
    expect(render(resolvedComment({ id: 42 }))).toMatch(
      /^<li class="plumix-comment" id="comment-42"/,
    );
  });

  test("shows the day it was posted, without the time", () => {
    expect(render(resolvedComment())).toContain(
      '<time class="plumix-comment-date" dateTime="2026-03-04T21:30:00.000Z">2026-03-04</time>',
    );
  });

  test("nests its replies under it", () => {
    const reply = resolvedComment({
      id: 2,
      authorName: "Grace",
      bodyHtml: "<p>Reply</p>",
    });

    const html = render(resolvedComment({ replies: [reply] }));

    expect(html).toContain(
      '<ol class="plumix-comment-replies"><li class="plumix-comment" id="comment-2"',
    );
    expect(html).toContain("Grace");
    expect(html).toMatch(/<p>Reply<\/p>.*<\/li><\/ol><\/li>$/);
  });

  test("a comment with no replies has no reply list", () => {
    expect(render(resolvedComment())).not.toContain("plumix-comment-replies");
  });
});

import { describe, expect, test } from "vitest";

import type { ResolvedComment } from "./server/load-thread.js";
import type { CommentThreadState } from "./thread-state.js";
import {
  applyCommentPage,
  formAfterAnswer,
  openThread,
  threadError,
} from "./thread-state.js";

function comment(id: number): ResolvedComment {
  return {
    id,
    authorName: "Ada",
    isRegistered: false,
    avatarUrl: "https://gravatar.test/avatar",
    bodyHtml: "<p>hello</p>",
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    replies: [],
  };
}

describe("formAfterAnswer", () => {
  test("hands back how an accepted comment was filed, with no errors", () => {
    expect(formAfterAnswer({ ok: true, status: "pending" })).toEqual({
      errors: [],
      status: "pending",
    });
  });

  test("leaves no status standing beside a later refusal", () => {
    const errors = [{ field: "", message: "Too many comments." }];

    expect(formAfterAnswer({ ok: false, errors })).toEqual({
      errors,
      status: null,
    });
  });
});

describe("openThread", () => {
  test("has more to load below a thread rendered with a cursor", () => {
    expect(openThread("100_3").hasMore).toBe(true);
  });

  test("has nothing more to load below a thread rendered without one", () => {
    expect(openThread(null).hasMore).toBe(false);
  });
});

describe("applyCommentPage", () => {
  test("appends a second page after the first, and asks next after it", () => {
    const first: CommentThreadState = {
      comments: [comment(3)],
      hasMore: true,
      cursor: "50_2",
      error: null,
    };

    const next = applyCommentPage(first, {
      ok: true,
      comments: [comment(2)],
      hasMore: true,
      nextCursor: "20_1",
    });

    expect(next.comments.map((loaded) => loaded.id)).toEqual([3, 2]);
    expect(next.cursor).toBe("20_1");
  });

  test("stops offering more once a page says there are none", () => {
    const next = applyCommentPage(openThread("100_3"), {
      ok: true,
      comments: [comment(3)],
      hasMore: false,
      nextCursor: null,
    });

    expect(next.hasMore).toBe(false);
  });

  test("keeps the cursor of a page that failed, so a retry asks for it again", () => {
    const next = applyCommentPage(openThread("100_3"), {
      ok: false,
      reason: "unreachable",
    });

    expect(next.cursor).toBe("100_3");
    expect(next.hasMore).toBe(true);
  });

  test("says why a page failed", () => {
    const next = applyCommentPage(openThread("100_3"), {
      ok: false,
      reason: "comments_closed",
    });

    expect(next.error).toBe("This discussion has closed.");
  });

  test("clears the last failure once a retry lands", () => {
    const failed: CommentThreadState = {
      comments: [],
      hasMore: true,
      cursor: "100_3",
      error: "Those comments could not be loaded. Please try again.",
    };

    const next = applyCommentPage(failed, {
      ok: true,
      comments: [comment(3)],
      hasMore: false,
      nextCursor: null,
    });

    expect(next.error).toBeNull();
  });
});

describe("threadError", () => {
  test("names the refusal the route answered with", () => {
    expect(threadError("comments_disabled")).toBe(
      "Comments are not open here.",
    );
  });

  test("says the comments could not be loaded when nothing answered", () => {
    expect(threadError("unreachable")).toBe(
      "Those comments could not be loaded. Please try again.",
    );
  });
});

import { describe, expect, test } from "vitest";

import type { ResolvedComment } from "./server/load-thread.js";
import { stubFetch } from "./test/fetch.js";
import {
  confirmationFor,
  fetchCommentPage,
  postComment,
  submitAction,
} from "./wire.js";

const endpoint = stubFetch();

const DRAFT = {
  entryId: 7,
  parentId: null,
  name: "Ada",
  email: "ada@example.test",
  body: "hello",
};

/**
 * A non-string body is the failure, not something to coerce: the string is
 * what makes the request JSON, which the endpoint negotiates its answer on.
 */
function posted(): unknown {
  const body = endpoint.current().mock.calls.at(-1)?.[1]?.body;
  if (typeof body !== "string") {
    expect.unreachable("postComment sent something other than a JSON body");
  }
  return JSON.parse(body);
}

describe("postComment", () => {
  test("posts the comment as JSON to the action it is handed", async () => {
    await postComment("/_plumix/comments/submit", DRAFT);

    expect(endpoint.current().mock.calls[0]?.[0]).toBe(
      "/_plumix/comments/submit",
    );
    expect(posted()).toEqual(DRAFT);
  });

  test("sends the header a plain form cannot, so the session survives", async () => {
    await postComment("/_plumix/comments/submit", DRAFT);

    const headers = new Headers(endpoint.current().mock.calls[0]?.[1]?.headers);
    expect(headers.get("X-Plumix-Request")).toBe("1");
  });

  test("hands back how the comment was filed", async () => {
    endpoint.answering({ status: "pending" });

    await expect(
      postComment("/_plumix/comments/submit", DRAFT),
    ).resolves.toEqual({ ok: true, status: "pending" });
  });

  test("hands back a refusal against the control it names", async () => {
    endpoint.answering({ error: "email_required" }, 400);

    await expect(
      postComment("/_plumix/comments/submit", DRAFT),
    ).resolves.toEqual({
      ok: false,
      errors: [{ field: "email", message: "An email address is required." }],
    });
  });

  test("an unknown refusal is unreachable, naming no control", async () => {
    endpoint.answering({ error: "something_new" }, 500);

    await expect(
      postComment("/_plumix/comments/submit", DRAFT),
    ).resolves.toEqual({
      ok: false,
      errors: [
        {
          field: "",
          message: "Your comment could not be sent. Please try again.",
        },
      ],
    });
  });

  test("a submission that never landed names no control", async () => {
    endpoint
      .current()
      .mockImplementation(() => Promise.reject(new Error("offline")));

    await expect(
      postComment("/_plumix/comments/submit", DRAFT),
    ).resolves.toEqual({
      ok: false,
      errors: [
        {
          field: "",
          message: "Your comment could not be sent. Please try again.",
        },
      ],
    });
  });
});

describe("confirmationFor", () => {
  test("says an approved comment was posted", () => {
    expect(confirmationFor("approved")).toBe(
      "Thanks — your comment has been posted.",
    );
  });

  test.each(["pending", "spam", "trash"] as const)(
    "says a %s comment was sent for review, as a held one is",
    (status) => {
      expect(confirmationFor(status)).toBe(
        "Thanks — your comment has been sent for review.",
      );
    },
  );
});

describe("submitAction", () => {
  test("posts to the submit route at the domain root", () => {
    expect(submitAction("")).toBe("/_plumix/comments/submit");
  });

  test("posts under the subdirectory the deployment is mounted at", () => {
    expect(submitAction("/blog")).toBe("/blog/_plumix/comments/submit");
  });
});

interface WireComment {
  readonly id: number;
  readonly authorName: string;
  readonly isRegistered: boolean;
  readonly avatarUrl: string;
  readonly bodyHtml: string;
  readonly createdAt: string;
  readonly replies: readonly WireComment[];
}

/** One comment as the list route serializes it. */
function wireComment(
  id: number,
  createdAt = "2026-06-01T00:00:00.000Z",
  replies: readonly WireComment[] = [],
): WireComment {
  return {
    id,
    authorName: "Ada",
    isRegistered: false,
    avatarUrl: "https://gravatar.test/avatar",
    bodyHtml: "<p>hello</p>",
    createdAt,
    replies,
  };
}

function everyCreatedAt(comments: readonly ResolvedComment[]): unknown[] {
  return comments.flatMap((comment) => [
    comment.createdAt,
    ...everyCreatedAt(comment.replies),
  ]);
}

describe("fetchCommentPage", () => {
  test("asks for the page after the cursor it was handed", async () => {
    endpoint.answering({ comments: [], hasMore: false, nextCursor: null });

    await fetchCommentPage(7, "100_3", "");

    expect(endpoint.current().mock.calls[0]?.[0]).toBe(
      "/_plumix/comments/list?entryId=7&cursor=100_3",
    );
  });

  test("asks under the subdirectory the deployment is mounted at", async () => {
    endpoint.answering({ comments: [], hasMore: false, nextCursor: null });

    await fetchCommentPage(7, "100_3", "/blog");

    expect(endpoint.current().mock.calls[0]?.[0]).toBe(
      "/blog/_plumix/comments/list?entryId=7&cursor=100_3",
    );
  });

  test("leaves the cursor off when there is none to send", async () => {
    endpoint.answering({ comments: [], hasMore: false, nextCursor: null });

    await fetchCommentPage(7, null, "");

    expect(endpoint.current().mock.calls[0]?.[0]).toBe(
      "/_plumix/comments/list?entryId=7",
    );
  });

  test("hands back every comment and reply with a real Date", async () => {
    endpoint.answering({
      comments: [
        wireComment(4, "2026-06-04T00:00:00.000Z", [
          wireComment(5, "2026-06-05T00:00:00.000Z", [
            wireComment(6, "2026-06-06T00:00:00.000Z"),
          ]),
        ]),
      ],
      hasMore: false,
      nextCursor: null,
    });

    const answer = await fetchCommentPage(7, "100_3", "");

    expect(answer.ok && everyCreatedAt(answer.comments)).toEqual([
      new Date("2026-06-04T00:00:00.000Z"),
      new Date("2026-06-05T00:00:00.000Z"),
      new Date("2026-06-06T00:00:00.000Z"),
    ]);
  });

  test("names the refusal the route answered with", async () => {
    endpoint.answering({ error: "comments_disabled" }, 403);

    await expect(fetchCommentPage(7, "100_3", "")).resolves.toEqual({
      ok: false,
      reason: "comments_disabled",
    });
  });

  test("is unreachable when the network fails", async () => {
    endpoint
      .current()
      .mockImplementation(() => Promise.reject(new Error("offline")));

    await expect(fetchCommentPage(7, "100_3", "")).resolves.toEqual({
      ok: false,
      reason: "unreachable",
    });
  });

  test("is unreachable when the payload is not a page", async () => {
    endpoint.answering({
      comments: [{ ...wireComment(3), createdAt: "yesterday" }],
      hasMore: false,
      nextCursor: null,
    });

    await expect(fetchCommentPage(7, "100_3", "")).resolves.toEqual({
      ok: false,
      reason: "unreachable",
    });
  });
});

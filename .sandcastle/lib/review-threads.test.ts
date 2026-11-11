import { describe, expect, test } from "vitest";

import { readReviewThreads } from "./review-threads.js";

describe("readReviewThreads", () => {
  test("findings include replies and threads beyond the first GitHub page", () => {
    const comment = {
      author: { login: "reviewer", __typename: "Bot" },
      body: "original finding",
      url: "thread/1",
    };
    const pageInfo = { hasNextPage: false, endCursor: null };
    const thread = {
      id: "t1",
      path: "a.ts",
      line: 2,
      isResolved: false,
      comments: {
        nodes: [comment],
        pageInfo: { hasNextPage: true, endCursor: "reply" },
      },
    };

    const threads = readReviewThreads(
      {
        nodes: [thread],
        pageInfo: { hasNextPage: true, endCursor: "threads" },
      },
      () => ({
        nodes: [
          {
            ...thread,
            id: "t2",
            path: "b.ts",
            comments: { nodes: [comment], pageInfo },
          },
        ],
        pageInfo,
      }),
      () => ({
        nodes: [{ ...comment, body: "reply with evidence" }],
        pageInfo,
      }),
    );

    expect(threads.map(({ location }) => location)).toEqual([
      "a.ts:2",
      "b.ts:2",
    ]);
    expect(threads[0]?.body).toContain("reply with evidence");
  });
});

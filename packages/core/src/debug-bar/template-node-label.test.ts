import { describe, expect, test } from "vitest";

import { templateNodeLabel } from "./template-node-label.js";

describe("templateNodeLabel", () => {
  test("labels each resolved node kind", () => {
    expect(
      templateNodeLabel({
        kind: "content",
        entryType: "post",
        slug: "hello-world",
        databaseId: 1,
      }),
    ).toBe("post: hello-world");
    expect(
      templateNodeLabel({
        kind: "term",
        taxonomy: "category",
        slug: "news",
        databaseId: 2,
      }),
    ).toBe("category: news");
    expect(
      templateNodeLabel({ kind: "content-type-archive", entryType: "post" }),
    ).toBe("post archive");
    expect(templateNodeLabel({ kind: "front-page" })).toBe("front page");
    expect(templateNodeLabel({ kind: "posts-page" })).toBe("posts page");
    expect(templateNodeLabel({ kind: "search" })).toBe("search");
  });
});

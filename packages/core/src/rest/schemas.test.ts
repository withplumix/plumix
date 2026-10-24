import * as v from "valibot";
import { describe, expect, test } from "vitest";

import { publicEntrySchema } from "./schemas.js";

const entry = {
  id: 1,
  type: "post",
  slug: "hello",
  title: "Hello",
  excerpt: null,
  content: null,
  contentGated: false,
  status: "published",
  publishedAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  author: { id: 1, name: "Ada", avatarUrl: null },
  terms: {},
  meta: {},
  images: {},
};

describe("publicEntrySchema", () => {
  test("accepts an entry with an author", () => {
    expect(v.safeParse(publicEntrySchema, entry).success).toBe(true);
  });

  test("rejects an entry whose author is null", () => {
    expect(
      v.safeParse(publicEntrySchema, { ...entry, author: null }).success,
    ).toBe(false);
  });
});

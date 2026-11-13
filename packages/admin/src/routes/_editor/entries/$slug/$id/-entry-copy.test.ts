import { describe, expect, test } from "vitest";

import type { SavedEntry } from "./-entry-copy.js";
import { compareEntry } from "./-entry-copy.js";

const SAVED: SavedEntry = {
  title: "Saved title",
  slug: "saved-elsewhere",
  status: "draft",
  parentId: null,
  content: null,
  excerpt: null,
  meta: { headline: "Staff writer" },
  terms: {},
};

describe("compareEntry", () => {
  test("mine is what is saved now with my edit kept over it, beside what is saved now", () => {
    const sides = compareEntry(
      { kind: "update", patch: { slug: "my-slug", saveAs: "live" } },
      SAVED,
    );

    expect(sides).toEqual({
      mine: {
        title: "Saved title",
        slug: "my-slug",
        status: "draft",
        parentId: null,
        content: null,
        excerpt: null,
        meta: { headline: "Staff writer" },
        terms: {},
      },
      theirs: SAVED,
    });
  });

  test("my meta edit is kept over the saved meta, not in place of it", () => {
    const sides = compareEntry(
      { kind: "update", patch: { meta: { twitter: "@jane" } } },
      SAVED,
    );

    expect(sides.mine).toMatchObject({
      meta: { headline: "Staff writer", twitter: "@jane" },
    });
  });

  test("my changed taxonomy is kept over the saved terms, and the taxonomies I left alone stay", () => {
    const sides = compareEntry(
      { kind: "update", patch: { terms: { tag: [7] } } },
      { ...SAVED, terms: { category: [1], tag: [3, 4] } },
    );

    expect(sides.mine).toMatchObject({ terms: { category: [1], tag: [7] } });
  });

  test("a meta key my edit removes is gone from mine", () => {
    const sides = compareEntry(
      { kind: "update", patch: { meta: { headline: null } } },
      SAVED,
    );

    expect(sides.mine).toEqual({
      title: "Saved title",
      slug: "saved-elsewhere",
      status: "draft",
      parentId: null,
      content: null,
      excerpt: null,
      meta: {},
      terms: {},
    });
  });

  test("my template pick shows in mine's meta, where the server keeps it", () => {
    const sides = compareEntry(
      { kind: "update", patch: { template: "landing" } },
      SAVED,
    );

    expect(sides.mine).toEqual({
      title: "Saved title",
      slug: "saved-elsewhere",
      status: "draft",
      parentId: null,
      content: null,
      excerpt: null,
      meta: { headline: "Staff writer", __plumix_template: "landing" },
      terms: {},
    });
  });

  test("clearing the access policy removes it from mine's meta", () => {
    const sides = compareEntry(
      { kind: "update", patch: { access: null } },
      {
        ...SAVED,
        meta: { headline: "Staff writer", __plumix_access: "members" },
      },
    );

    expect(sides.mine).toEqual({
      title: "Saved title",
      slug: "saved-elsewhere",
      status: "draft",
      parentId: null,
      content: null,
      excerpt: null,
      meta: { headline: "Staff writer" },
      terms: {},
    });
  });

  test("a publish shows what is saved now, published", () => {
    const sides = compareEntry({ kind: "publish" }, SAVED);

    expect(sides.mine).toMatchObject({
      slug: "saved-elsewhere",
      status: "published",
    });
  });

  test("a restore shows what is saved now, naming the revision it restores", () => {
    const sides = compareEntry({ kind: "restore", revisionId: 42 }, SAVED);

    expect(sides.mine).toMatchObject({
      slug: "saved-elsewhere",
      revisionId: 42,
    });
  });

  test("until what is saved now is read, mine is my edit alone and theirs is empty", () => {
    const sides = compareEntry(
      { kind: "update", patch: { title: "My title" } },
      undefined,
    );

    expect(sides).toEqual({ mine: { title: "My title" }, theirs: null });
  });
});

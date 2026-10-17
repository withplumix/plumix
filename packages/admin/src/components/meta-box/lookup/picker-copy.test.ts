import {
  GENERIC_ENTRY_TYPE_LABELS,
  GENERIC_TERM_TAXONOMY_LABELS,
} from "@/lib/type-labels.js";
import { describe, expect, test } from "vitest";

import type {
  EntryTypeManifestEntry,
  PlumixManifest,
  TermTaxonomyManifestEntry,
} from "@plumix/core/manifest";

import { lookupListNotice, referencePickerCopy } from "./picker-copy.js";

function entryType(
  name: string,
  labels?: EntryTypeManifestEntry["labels"],
): EntryTypeManifestEntry {
  return {
    name,
    adminSlug: `${name}s`,
    label: name,
    isPublic: true,
    showUI: true,
    showInSidebar: true,
    labels,
  } as EntryTypeManifestEntry;
}

function pick(
  labels: Record<string, unknown>,
): Record<(typeof KEYS)[number], unknown> {
  return Object.fromEntries(KEYS.map((key) => [key, labels[key]])) as Record<
    (typeof KEYS)[number],
    unknown
  >;
}

/** Each label's source message, so a test reads the English copy. */
function messages(copy: object): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(copy).map(([key, label]) => [
      key,
      typeof label === "string"
        ? label
        : (label as { message?: string }).message,
    ]),
  );
}

const KEYS = [
  "searchItems",
  "notFound",
  "noMatch",
  "loadingItems",
  "loadErrorItems",
] as const;

const POST_LABELS = {
  searchItems: { id: "blog.post.searchItems", message: "Search Posts" },
  notFound: { id: "blog.post.notFound", message: "No posts yet" },
  noMatch: { id: "blog.post.noMatch", message: "No posts match" },
  loadingItems: { id: "blog.post.loadingItems", message: "Loading posts" },
  loadErrorItems: {
    id: "blog.post.loadErrorItems",
    message: "Couldn’t load posts. Try again.",
  },
};

describe("referencePickerCopy", () => {
  test("an entry field scoped to one labelled type uses that type's labels", () => {
    const manifest: PlumixManifest = {
      entryTypes: [entryType("post", POST_LABELS)],
    };
    expect(
      referencePickerCopy("entry", { entryTypes: ["post"] }, manifest),
    ).toEqual(POST_LABELS);
  });

  test("an entry field scoped to one type without labels uses the generic labels", () => {
    const manifest: PlumixManifest = { entryTypes: [entryType("page")] };
    expect(
      referencePickerCopy("entry", { entryTypes: ["page"] }, manifest),
    ).toEqual(pick(GENERIC_ENTRY_TYPE_LABELS));
  });

  test("an entry field scoped to two types uses the generic labels", () => {
    const manifest: PlumixManifest = {
      entryTypes: [entryType("post", POST_LABELS), entryType("page")],
    };
    expect(
      referencePickerCopy("entry", { entryTypes: ["post", "page"] }, manifest),
    ).toEqual(pick(GENERIC_ENTRY_TYPE_LABELS));
  });

  test("a term field scoped to one taxonomy uses that taxonomy's labels", () => {
    const labels = {
      searchItems: { id: "blog.tag.searchItems", message: "Search tags…" },
      noMatch: { id: "blog.tag.noMatch", message: "No tags match" },
    };
    const manifest: PlumixManifest = {
      termTaxonomies: [
        { name: "tag", label: "Tags", labels } as TermTaxonomyManifestEntry,
      ],
    };
    expect(
      referencePickerCopy("term", { termTaxonomies: ["tag"] }, manifest),
    ).toEqual({ ...pick(GENERIC_TERM_TAXONOMY_LABELS), ...labels });
  });

  test("a user field names users", () => {
    const copy = referencePickerCopy("user", { roles: ["admin"] }, {});
    expect(messages(copy)).toEqual({
      searchItems: "Search users",
      notFound: "No users yet",
      noMatch: "No users match",
      loadingItems: "Loading users…",
      loadErrorItems: "Couldn’t load users. Try again.",
    });
  });

  test("a plugin's lookup kind uses the noun-less generic labels", () => {
    const manifest: PlumixManifest = {
      entryTypes: [entryType("post", POST_LABELS)],
    };
    expect(
      referencePickerCopy("media", { entryTypes: ["post"] }, manifest),
    ).toEqual(pick(GENERIC_ENTRY_TYPE_LABELS));
  });
});

describe("lookupListNotice", () => {
  const ready = { isLoading: false, isError: false, itemCount: 0, query: "" };

  test("an empty list with no query says there is nothing yet", () => {
    expect(lookupListNotice(POST_LABELS, ready)).toBe(POST_LABELS.notFound);
  });

  test("an empty list for a query says nothing matches", () => {
    expect(lookupListNotice(POST_LABELS, { ...ready, query: "hel" })).toBe(
      POST_LABELS.noMatch,
    );
  });

  test("a whitespace-only query searches everything, so says nothing yet", () => {
    expect(lookupListNotice(POST_LABELS, { ...ready, query: "  " })).toBe(
      POST_LABELS.notFound,
    );
  });

  test("a pending search says it is loading", () => {
    expect(lookupListNotice(POST_LABELS, { ...ready, isLoading: true })).toBe(
      POST_LABELS.loadingItems,
    );
  });

  test("a failed search says it couldn't load", () => {
    expect(lookupListNotice(POST_LABELS, { ...ready, isError: true })).toBe(
      POST_LABELS.loadErrorItems,
    );
  });

  test("a list with items shows no notice", () => {
    expect(
      lookupListNotice(POST_LABELS, { ...ready, itemCount: 2 }),
    ).toBeNull();
  });
});

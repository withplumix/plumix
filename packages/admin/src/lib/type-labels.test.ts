import { describe, expect, test } from "vitest";

import type {
  EntryTypeManifestEntry,
  TermTaxonomyManifestEntry,
} from "@plumix/core/manifest";

import {
  entryTypeLabel,
  GENERIC_ENTRY_TYPE_LABELS,
  termTaxonomyLabel,
} from "./type-labels.js";

// The cascade contract for both helpers: per-type label when the
// plugin author declared it, generic noun-less fallback otherwise.
// Drops the substitution pattern entirely — never `.toLowerCase()`
// a translated noun and never glue the type name into a sentence.

describe("entryTypeLabel", () => {
  test("returns the per-type label when declared", () => {
    const entry = {
      name: "post",
      adminSlug: "posts",
      label: "Posts",
      labels: {
        addNewItem: { id: "blog.post.addNewItem", message: "Add Post" },
      },
    } as EntryTypeManifestEntry;
    expect(entryTypeLabel(entry, "addNewItem")).toEqual({
      id: "blog.post.addNewItem",
      message: "Add Post",
    });
  });

  test("falls back to the generic descriptor when the key isn't declared", () => {
    const entry = {
      name: "post",
      adminSlug: "posts",
      label: "Posts",
      labels: { singular: "Post", plural: "Posts" },
    } as EntryTypeManifestEntry;
    expect(entryTypeLabel(entry, "addNewItem")).toBe(
      GENERIC_ENTRY_TYPE_LABELS.addNewItem,
    );
  });

  test("falls back when labels is omitted entirely", () => {
    const entry = {
      name: "post",
      adminSlug: "posts",
      label: "Posts",
    } as EntryTypeManifestEntry;
    expect(entryTypeLabel(entry, "searchItems")).toBe(
      GENERIC_ENTRY_TYPE_LABELS.searchItems,
    );
  });
});

describe("termTaxonomyLabel", () => {
  test("returns the per-type label when declared", () => {
    const tax = {
      name: "category",
      label: "Categories",
      labels: {
        notFound: { id: "blog.cat.notFound", message: "No categories yet" },
      },
    } as TermTaxonomyManifestEntry;
    expect(termTaxonomyLabel(tax, "notFound")).toEqual({
      id: "blog.cat.notFound",
      message: "No categories yet",
    });
  });

  test("falls back to the generic descriptor when the key isn't declared", () => {
    const tax = {
      name: "tag",
      label: "Tags",
    } as TermTaxonomyManifestEntry;
    // Shape equality — entry-type and taxonomy generic tables share
    // ids/messages for cross-cutting keys (notFound, search, loading,
    // …) but ship as separate object literals from the core module.
    expect(termTaxonomyLabel(tax, "notFound")).toStrictEqual(
      GENERIC_ENTRY_TYPE_LABELS.notFound,
    );
  });
});

describe("GENERIC_ENTRY_TYPE_LABELS", () => {
  test("ships a noun-less message for every cascade fallback (entry + taxonomy)", async () => {
    // Pin the rule: the generic catalog never mentions the type's noun.
    // If a fallback ever needs to reference the entity, that's the
    // signal to make the field required on the per-type labels table.
    // Loop both tables — the entry alias and the term-taxonomy table —
    // so a hand-edit on either can't silently regress the invariant.
    const { GENERIC_TERM_TAXONOMY_LABELS } = await import("@plumix/core/i18n");
    const everyDescriptor = [
      ...Object.values(GENERIC_ENTRY_TYPE_LABELS),
      ...Object.values(GENERIC_TERM_TAXONOMY_LABELS),
    ];
    for (const descriptor of everyDescriptor) {
      expect(descriptor.message).not.toMatch(/\{(plural|singular)/i);
    }
  });
});

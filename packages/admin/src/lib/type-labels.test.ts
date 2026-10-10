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

// Never `.toLowerCase()` a translated noun or glue the type name into a
// sentence.

describe("entryTypeLabel", () => {
  test("returns the per-type label when declared", () => {
    const entry = {
      name: "post",
      adminSlug: "posts",
      label: "Posts",
      isPublic: true,
      showUI: true,
      showInSidebar: true,
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
      isPublic: true,
      showUI: true,
      showInSidebar: true,
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
      isPublic: true,
      showUI: true,
      showInSidebar: true,
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
      isPublic: true,
      showUI: true,
      showInSidebar: true,
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
      isPublic: true,
      showUI: true,
      showInSidebar: true,
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
    // A fallback that needs the noun means the per-type label should be
    // required instead.
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

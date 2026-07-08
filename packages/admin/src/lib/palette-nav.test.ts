import { describe, expect, test } from "vitest";

import type { Label } from "@plumix/core/i18n";
import type { PlumixManifest } from "@plumix/core/manifest";

import { labelText as text } from "../../test/label-text.js";
import { paletteNavItems, selectNavItems } from "./palette-nav.js";

const SOURCE: PlumixManifest = {
  adminNav: [
    {
      id: "content",
      label: { id: "g.content", message: "Content" },
      items: [
        {
          to: "/entries/posts",
          label: { id: "i.posts", message: "Posts" },
          coreIcon: "file-text",
        },
        {
          to: "/users",
          label: { id: "i.users", message: "Users" },
          capability: "user:list",
          coreIcon: "users",
        },
      ],
    },
  ],
};

describe("paletteNavItems", () => {
  test("flattens visible nav groups into a single item list", () => {
    const items = paletteNavItems(["user:list"], SOURCE);
    expect(items).toEqual([
      {
        to: "/entries/posts",
        label: { id: "i.posts", message: "Posts" },
        coreIcon: "file-text",
      },
      {
        to: "/users",
        label: { id: "i.users", message: "Users" },
        coreIcon: "users",
      },
    ]);
  });

  test("drops items whose capability the user lacks, reusing the sidebar filter", () => {
    const items = paletteNavItems([], SOURCE);
    expect(items.map((item) => item.to)).toEqual(["/entries/posts"]);
  });
});

describe("selectNavItems", () => {
  const items = [
    {
      to: "/media",
      label: { id: "i.media", message: "Media Library" } as Label,
      keywords: [
        { id: "k.uploads", message: "uploads" },
        { id: "k.images", message: "images" },
      ] as readonly Label[],
    },
    {
      to: "/settings",
      label: { id: "i.settings", message: "Settings" } as Label,
    },
  ];

  test("returns all items for an empty query", () => {
    expect(selectNavItems(items, "", text).map((i) => i.to)).toEqual([
      "/media",
      "/settings",
    ]);
  });

  test("matches a synonym against keywords, not just the visible label", () => {
    expect(selectNavItems(items, "uploads", text).map((i) => i.to)).toEqual([
      "/media",
    ]);
  });

  test("matches against the label too", () => {
    expect(selectNavItems(items, "settings", text).map((i) => i.to)).toEqual([
      "/settings",
    ]);
  });

  test("matches keywords against their resolved translation, not the source", () => {
    // Stands in for a non-English locale: the resolver translates the
    // `uploads` keyword to a localized synonym. Proves keyword matching runs
    // through the i18n seam, so localized aliases are searchable and the
    // English source term is not what gets matched under that locale.
    const localize = (label: Label): string =>
      typeof label !== "string" && label.id === "k.uploads"
        ? "надсилання"
        : text(label);
    expect(
      selectNavItems(items, "надсилання", localize).map((i) => i.to),
    ).toEqual(["/media"]);
    // "uploads" reaches /media only via the k.uploads keyword, now remapped,
    // so under this locale the English source term resolves to nothing.
    expect(selectNavItems(items, "uploads", localize)).toEqual([]);
  });
});

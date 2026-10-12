import { i18n } from "@lingui/core";
import { beforeEach, describe, expect, test } from "vitest";

import type { PlumixManifest } from "@plumix/core/manifest";

import type { Crumb } from "./breadcrumbs.js";
import { pathToCrumbs } from "./breadcrumbs.js";

const FIXTURE: PlumixManifest = {
  entryTypes: [
    {
      name: "post",
      capabilityType: "post",
      adminSlug: "posts",
      label: "Posts",
      isPublic: true,
      showUI: true,
      showInSidebar: true,
      labels: { singular: "Post", plural: "Posts" },
    },
    {
      name: "page",
      capabilityType: "page",
      adminSlug: "pages",
      label: "Pages",
      isPublic: true,
      showUI: true,
      showInSidebar: true,
    },
  ],
  termTaxonomies: [
    {
      name: "category",
      label: "Categories",
      isPublic: true,
      showUI: true,
      showInSidebar: true,
      labels: { singular: "Category" },
    },
    {
      name: "tag",
      label: "Tags",
      isPublic: true,
      showUI: true,
      showInSidebar: true,
    },
  ],
  settingsPages: [{ name: "general", label: "General", groups: [] }],
  adminNav: [
    {
      id: "plugins",
      label: "Plugins",
      items: [
        {
          to: "/pages/media",
          label: "Media Library",
          component: "media:MediaLibrary",
        },
      ],
    },
  ],
};

beforeEach(() => {
  // Source-locale renders use `descriptor.message` directly; explicit en
  // catalog keeps the resolver on the cheap path.
  i18n.load({ en: {} });
  i18n.activate("en");
});

function labels(crumbs: readonly Crumb[]): readonly {
  label: string;
  to?: string;
}[] {
  return crumbs.map((c) => ({
    label:
      typeof c.label === "string"
        ? c.label
        : i18n._(c.label.id, c.values, { message: c.label.message }),
    ...(c.to !== undefined ? { to: c.to } : {}),
  }));
}

describe("pathToCrumbs", () => {
  test.each(["/", ""])("dashboard at %j", (pathname) => {
    expect(labels(pathToCrumbs(pathname, FIXTURE))).toEqual([
      { label: "Dashboard" },
    ]);
  });

  test("entries list resolves the plural label from manifest (no link on leaf)", () => {
    expect(labels(pathToCrumbs("/entries/posts", FIXTURE))).toEqual([
      { label: "Entries" },
      { label: "Posts" },
    ]);
  });

  test("entries create: list crumb is a link, action crumb is leaf", () => {
    expect(labels(pathToCrumbs("/entries/posts/create", FIXTURE))).toEqual([
      { label: "Entries" },
      { label: "Posts", to: "/entries/posts" },
      { label: "Create" },
    ]);
  });

  test("entries edit: list crumb is a link, edit crumb is leaf", () => {
    expect(labels(pathToCrumbs("/entries/posts/42/edit", FIXTURE))).toEqual([
      { label: "Entries" },
      { label: "Posts", to: "/entries/posts" },
      { label: "Edit" },
    ]);
  });

  test("entries with unknown slug falls back to the raw segment", () => {
    expect(labels(pathToCrumbs("/entries/widgets", FIXTURE))).toEqual([
      { label: "Entries" },
      { label: "widgets" },
    ]);
  });

  test("terms create: leaf is the generic Create crumb (no noun interpolation)", () => {
    // The parent crumb already carries the plural label, so the leaf stays
    // noun-less and locale-safe.
    expect(labels(pathToCrumbs("/terms/category/create", FIXTURE))).toEqual([
      { label: "Terms" },
      { label: "Categories", to: "/terms/category" },
      { label: "Create" },
    ]);
  });

  test("terms edit: leaf is the generic Edit crumb (no noun interpolation)", () => {
    expect(labels(pathToCrumbs("/terms/category/7/edit", FIXTURE))).toEqual([
      { label: "Terms" },
      { label: "Categories", to: "/terms/category" },
      { label: "Edit" },
    ]);
  });

  test.each(["/terms/category/create", "/terms/category/7/edit"])(
    "terms leaf at %s carries no ICU `values` map",
    (pathname) => {
      const leaf = pathToCrumbs(pathname, FIXTURE).at(-1);
      expect(leaf).toBeDefined();
      expect(typeof leaf?.label).toBe("object");
      expect(leaf?.values).toBeUndefined();
    },
  );

  test("users edit: list crumb is a link", () => {
    expect(labels(pathToCrumbs("/users/3/edit", FIXTURE))).toEqual([
      { label: "Users", to: "/users" },
      { label: "Edit user" },
    ]);
  });

  test("settings list", () => {
    expect(labels(pathToCrumbs("/settings", FIXTURE))).toEqual([
      { label: "Settings" },
    ]);
  });

  test("settings page links back to the list", () => {
    expect(labels(pathToCrumbs("/settings/general", FIXTURE))).toEqual([
      { label: "Settings", to: "/settings" },
      { label: "General" },
    ]);
  });

  test("profile", () => {
    expect(labels(pathToCrumbs("/profile", FIXTURE))).toEqual([
      { label: "Profile" },
    ]);
  });

  test("a registered plugin page resolves to its declared label with no parent", () => {
    // No synthetic "Pages" parent: it would collide with the entry-type
    // Pages surface in the user's sidebar.
    expect(labels(pathToCrumbs("/pages/media", FIXTURE))).toEqual([
      { label: "Media Library" },
    ]);
  });

  test("an unregistered plugin path falls back to the URL slug with no parent", () => {
    expect(labels(pathToCrumbs("/pages/unknown", FIXTURE))).toEqual([
      { label: "unknown" },
    ]);
  });

  test("unknown top-level segment falls back to Admin", () => {
    expect(labels(pathToCrumbs("/whatever", FIXTURE))).toEqual([
      { label: "Admin" },
    ]);
  });

  test("translated labels resolve via active catalog", () => {
    i18n.load({
      en: {},
      de: {
        "breadcrumb.dashboard": "Übersicht",
        "breadcrumb.entries": "Einträge",
        "breadcrumb.create": "Erstellen",
      },
    });
    i18n.activate("de");
    expect(labels(pathToCrumbs("/entries/posts/create", FIXTURE))).toEqual([
      { label: "Einträge" },
      { label: "Posts", to: "/entries/posts" }, // manifest-derived, untranslated
      { label: "Erstellen" },
    ]);
  });
});

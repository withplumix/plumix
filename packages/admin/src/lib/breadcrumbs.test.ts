import type { MessageDescriptor } from "@lingui/core";
import { i18n } from "@lingui/core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { PlumixManifest } from "@plumix/core/manifest";

import type { Crumb } from "./breadcrumbs.js";
import type * as ManifestLib from "./manifest.js";
import { pathToCrumbs } from "./breadcrumbs.js";

const FIXTURE: PlumixManifest = {
  entryTypes: [
    {
      name: "post",
      adminSlug: "posts",
      label: "Posts",
      labels: { singular: "Post", plural: "Posts" },
    },
    { name: "page", adminSlug: "pages", label: "Pages" },
  ],
  termTaxonomies: [
    {
      name: "category",
      label: "Categories",
      labels: { singular: "Category" },
    },
    { name: "tag", label: "Tags" },
  ],
  settingsPages: [{ name: "general", label: "General", groups: [] }],
};

const PLUGIN_PAGES: { readonly to: string; readonly label: string }[] = [
  { to: "/pages/media", label: "Media Library" },
];

vi.mock(
  "./manifest.js",
  async (importOriginal): Promise<typeof ManifestLib> => {
    const actual = await importOriginal<typeof ManifestLib>();
    return {
      ...actual,
      findEntryTypeBySlug: (slug: string) =>
        FIXTURE.entryTypes?.find((e) => e.adminSlug === slug),
      findTermTaxonomyByName: (name: string) =>
        FIXTURE.termTaxonomies?.find((t) => t.name === name),
      findSettingsPageByName: (name: string) =>
        FIXTURE.settingsPages?.find((p) => p.name === name),
      findPluginPageByPath: (path: string) =>
        PLUGIN_PAGES.find((p) => p.to === path),
    };
  },
);

beforeEach(() => {
  // Source-locale renders use `descriptor.message` directly; explicit en
  // catalog keeps the resolver on the cheap path.
  i18n.load({ en: {} });
  i18n.activate("en");
});

afterEach(() => {
  vi.clearAllMocks();
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
  test("dashboard", () => {
    expect(labels(pathToCrumbs("/"))).toEqual([{ label: "Dashboard" }]);
    expect(labels(pathToCrumbs(""))).toEqual([{ label: "Dashboard" }]);
  });

  test("entries list resolves the plural label from manifest (no link on leaf)", () => {
    expect(labels(pathToCrumbs("/entries/posts"))).toEqual([
      { label: "Entries" },
      { label: "Posts" },
    ]);
  });

  test("entries create: list crumb is a link, action crumb is leaf", () => {
    expect(labels(pathToCrumbs("/entries/posts/create"))).toEqual([
      { label: "Entries" },
      { label: "Posts", to: "/entries/posts" },
      { label: "Create" },
    ]);
  });

  test("entries edit: list crumb is a link, edit crumb is leaf", () => {
    expect(labels(pathToCrumbs("/entries/posts/42/edit"))).toEqual([
      { label: "Entries" },
      { label: "Posts", to: "/entries/posts" },
      { label: "Edit" },
    ]);
  });

  test("entries with unknown slug falls back to the raw segment", () => {
    expect(labels(pathToCrumbs("/entries/widgets"))).toEqual([
      { label: "Entries" },
      { label: "widgets" },
    ]);
  });

  test("terms create: taxonomy crumb is a link", () => {
    expect(labels(pathToCrumbs("/terms/category/create"))).toEqual([
      { label: "Terms" },
      { label: "Categories", to: "/terms/category" },
      { label: "Create category" },
    ]);
  });

  test("terms edit: taxonomy crumb is a link, action uses singular label", () => {
    expect(labels(pathToCrumbs("/terms/category/7/edit"))).toEqual([
      { label: "Terms" },
      { label: "Categories", to: "/terms/category" },
      { label: "Edit category" },
    ]);
  });

  test("terms create/edit leaf carries an ICU descriptor + `{singular}` value", () => {
    // The taxonomy-specific singular ("Create category") used to be a
    // raw template literal that blocked `breadcrumbs.ts` from joining
    // admin's strict-mode ratchet. The leaf now ships as a
    // `MessageDescriptor` plus a `values` map; the render path threads
    // `values` into `i18n._` for placeholder substitution. Shape test
    // — separate from the rendering tests above — pins the contract.
    const createLeaf = pathToCrumbs("/terms/category/create").at(-1);
    expect(createLeaf).toBeDefined();
    expect(typeof createLeaf?.label).toBe("object");
    expect(createLeaf?.values).toEqual({ singular: "category" });

    const editLeaf = pathToCrumbs("/terms/category/7/edit").at(-1);
    expect(typeof editLeaf?.label).toBe("object");
    expect(editLeaf?.values).toEqual({ singular: "category" });
  });

  test("descriptor-typed labels.singular resolves through the locale", () => {
    // A plugin emitting `labels.singular: defineMessage({...})` should
    // see the descriptor flow through to the same `i18n._` resolution
    // path as every other Label-typed crumb field. The pre-widening
    // call site did `(tax?.labels?.singular ?? label).toLowerCase()`
    // which throws on an object — and crucially the schema forced
    // singular to be `string`, blocking the descriptor variant
    // entirely. This test pins the behavior post-widening: a
    // descriptor-typed singular resolves to its `.message` string
    // before the lowercase pass.
    const descriptor: MessageDescriptor = {
      id: "test.taxonomy.singular",
      message: "Category",
    };
    const tax = FIXTURE.termTaxonomies?.[0];
    if (!tax?.labels) throw new Error("fixture invariant violated");
    const original = tax.labels.singular;
    (tax.labels as { singular: unknown }).singular = descriptor;
    try {
      const createLeaf = pathToCrumbs("/terms/category/create").at(-1);
      expect(createLeaf?.values).toEqual({ singular: "category" });
    } finally {
      (tax.labels as { singular: unknown }).singular = original;
    }
  });

  test("users edit: list crumb is a link", () => {
    expect(labels(pathToCrumbs("/users/3/edit"))).toEqual([
      { label: "Users", to: "/users" },
      { label: "Edit user" },
    ]);
  });

  test("settings list + page", () => {
    expect(labels(pathToCrumbs("/settings"))).toEqual([{ label: "Settings" }]);
    expect(labels(pathToCrumbs("/settings/general"))).toEqual([
      { label: "Settings", to: "/settings" },
      { label: "General" },
    ]);
  });

  test("profile + plugin pages", () => {
    expect(labels(pathToCrumbs("/profile"))).toEqual([{ label: "Profile" }]);
    // Registered plugin page → resolves to its declared label, no
    // synthetic "Pages" parent (would collide with the entry-type Pages
    // surface in the user's sidebar).
    expect(labels(pathToCrumbs("/pages/media"))).toEqual([
      { label: "Media Library" },
    ]);
    // Unregistered plugin path → fall back to URL slug, still no parent.
    expect(labels(pathToCrumbs("/pages/unknown"))).toEqual([
      { label: "unknown" },
    ]);
  });

  test("unknown top-level segment falls back to Admin", () => {
    expect(labels(pathToCrumbs("/whatever"))).toEqual([{ label: "Admin" }]);
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
    expect(labels(pathToCrumbs("/entries/posts/create"))).toEqual([
      { label: "Einträge" },
      { label: "Posts", to: "/entries/posts" }, // manifest-derived, untranslated
      { label: "Erstellen" },
    ]);
  });
});

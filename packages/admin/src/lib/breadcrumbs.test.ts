import { afterEach, describe, expect, test, vi } from "vitest";

import type { PlumixManifest } from "@plumix/core/manifest";

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

vi.mock("./manifest.js", async (importOriginal) => {
  const real = await importOriginal<typeof ManifestLib>();
  return {
    ...real,
    findEntryTypeBySlug: (slug: string) =>
      FIXTURE.entryTypes?.find((e) => e.adminSlug === slug),
    findTermTaxonomyByName: (name: string) =>
      FIXTURE.termTaxonomies?.find((t) => t.name === name),
    findSettingsPageByName: (name: string) =>
      FIXTURE.settingsPages?.find((p) => p.name === name),
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("pathToCrumbs", () => {
  test("dashboard", () => {
    expect(pathToCrumbs("/")).toEqual([{ label: "Dashboard" }]);
    expect(pathToCrumbs("")).toEqual([{ label: "Dashboard" }]);
  });

  test("entries list resolves the plural label from manifest (no link on leaf)", () => {
    expect(pathToCrumbs("/entries/posts")).toEqual([
      { label: "Entries" },
      { label: "Posts" },
    ]);
  });

  test("entries create: list crumb is a link, action crumb is leaf", () => {
    expect(pathToCrumbs("/entries/posts/create")).toEqual([
      { label: "Entries" },
      { label: "Posts", to: "/entries/posts" },
      { label: "Create" },
    ]);
  });

  test("entries edit: list crumb is a link, edit crumb is leaf", () => {
    expect(pathToCrumbs("/entries/posts/42/edit")).toEqual([
      { label: "Entries" },
      { label: "Posts", to: "/entries/posts" },
      { label: "Edit" },
    ]);
  });

  test("entries with unknown slug falls back to the raw segment", () => {
    expect(pathToCrumbs("/entries/widgets")).toEqual([
      { label: "Entries" },
      { label: "widgets" },
    ]);
  });

  test("terms create: taxonomy crumb is a link", () => {
    expect(pathToCrumbs("/terms/category/create")).toEqual([
      { label: "Terms" },
      { label: "Categories", to: "/terms/category" },
      { label: "Create category" },
    ]);
  });

  test("terms edit: taxonomy crumb is a link, action uses singular label", () => {
    expect(pathToCrumbs("/terms/category/7/edit")).toEqual([
      { label: "Terms" },
      { label: "Categories", to: "/terms/category" },
      { label: "Edit category" },
    ]);
  });

  test("users edit: list crumb is a link", () => {
    expect(pathToCrumbs("/users/3/edit")).toEqual([
      { label: "Users", to: "/users" },
      { label: "Edit user" },
    ]);
  });

  test("settings list + page", () => {
    expect(pathToCrumbs("/settings")).toEqual([{ label: "Settings" }]);
    expect(pathToCrumbs("/settings/general")).toEqual([
      { label: "Settings", to: "/settings" },
      { label: "General" },
    ]);
  });

  test("profile + plugin pages", () => {
    expect(pathToCrumbs("/profile")).toEqual([{ label: "Profile" }]);
    expect(pathToCrumbs("/pages/menus")).toEqual([
      { label: "Pages" },
      { label: "menus" },
    ]);
  });

  test("unknown top-level segment falls back to Admin", () => {
    expect(pathToCrumbs("/whatever")).toEqual([{ label: "Admin" }]);
  });
});

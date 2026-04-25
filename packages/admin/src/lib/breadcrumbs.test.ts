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
    expect(pathToCrumbs("/")).toEqual(["Dashboard"]);
    expect(pathToCrumbs("")).toEqual(["Dashboard"]);
  });

  test("entries list resolves the plural label from manifest", () => {
    expect(pathToCrumbs("/entries/posts")).toEqual(["Entries", "Posts"]);
    expect(pathToCrumbs("/entries/pages")).toEqual(["Entries", "Pages"]);
  });

  test("entries create + edit append the action segment", () => {
    expect(pathToCrumbs("/entries/posts/create")).toEqual([
      "Entries",
      "Posts",
      "Create",
    ]);
    expect(pathToCrumbs("/entries/posts/42/edit")).toEqual([
      "Entries",
      "Posts",
      "Edit",
    ]);
  });

  test("entries with unknown slug falls back to the raw segment", () => {
    expect(pathToCrumbs("/entries/widgets")).toEqual(["Entries", "widgets"]);
  });

  test("terms list + create + edit use the taxonomy label and singular", () => {
    expect(pathToCrumbs("/terms/category")).toEqual(["Terms", "Categories"]);
    expect(pathToCrumbs("/terms/category/create")).toEqual([
      "Terms",
      "Categories",
      "Create category",
    ]);
    expect(pathToCrumbs("/terms/category/7/edit")).toEqual([
      "Terms",
      "Categories",
      "Edit category",
    ]);
  });

  test("users list + create + edit", () => {
    expect(pathToCrumbs("/users")).toEqual(["Users"]);
    expect(pathToCrumbs("/users/create")).toEqual(["Users", "Add new"]);
    expect(pathToCrumbs("/users/3/edit")).toEqual(["Users", "Edit user"]);
  });

  test("settings list + page", () => {
    expect(pathToCrumbs("/settings")).toEqual(["Settings"]);
    expect(pathToCrumbs("/settings/general")).toEqual(["Settings", "General"]);
  });

  test("profile + plugin pages", () => {
    expect(pathToCrumbs("/profile")).toEqual(["Profile"]);
    expect(pathToCrumbs("/pages/menus")).toEqual(["Pages", "menus"]);
  });

  test("unknown top-level segment falls back to Admin", () => {
    expect(pathToCrumbs("/whatever")).toEqual(["Admin"]);
  });
});

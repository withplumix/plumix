import { describe, expect, test } from "vitest";

import { getSelectedTab, withSelectedTab } from "./url-state.js";

describe("getSelectedTab", () => {
  test("defaults to the edit tab when ?tab= is absent", () => {
    expect(getSelectedTab("?menu=main")).toBe("edit");
  });

  test("?tab=locations opens the locations tab", () => {
    expect(getSelectedTab("?menu=main&tab=locations")).toBe("locations");
  });

  test("an unknown tab falls back to the edit tab", () => {
    expect(getSelectedTab("?tab=settings")).toBe("edit");
  });
});

describe("withSelectedTab", () => {
  test("choosing the locations tab writes it to the query, keeping the menu", () => {
    expect(
      withSelectedTab(
        "https://cms.example/_plumix/admin/pages/menus?menu=main",
        "locations",
      ),
    ).toBe(
      "https://cms.example/_plumix/admin/pages/menus?menu=main&tab=locations",
    );
  });

  test("choosing the edit tab drops the param, since edit is the default", () => {
    expect(
      withSelectedTab(
        "https://cms.example/_plumix/admin/pages/menus?tab=locations&menu=main",
        "edit",
      ),
    ).toBe("https://cms.example/_plumix/admin/pages/menus?menu=main");
  });
});

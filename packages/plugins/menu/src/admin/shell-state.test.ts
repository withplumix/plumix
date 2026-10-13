import { ORPCError } from "@orpc/client";
import { describe, expect, test } from "vitest";

import {
  boundMenuSlug,
  conflictShown,
  linkedTargetText,
  locationCheckbox,
  maxDepthRejected,
  menusPageState,
  pickerChoice,
  pickerPanelFor,
  searchResultsState,
  termSlugFromSelect,
  UNASSIGNED_VALUE,
} from "./shell-state.js";

const MAIN = { id: 7, slug: "main", name: "Main", version: 1, itemCount: 0 };
const FOOTER = {
  id: 8,
  slug: "footer",
  name: "Footer",
  version: 1,
  itemCount: 0,
};

function versionMismatch(): ORPCError<"CONFLICT", unknown> {
  return new ORPCError("CONFLICT", {
    status: 409,
    message: "concurrent edit",
    data: { reason: "version_mismatch", key: "1" },
  });
}

describe("menusPageState", () => {
  test("shows the loading state while the menus load", () => {
    expect(menusPageState({ isLoading: true, data: undefined })).toBe(
      "loading",
    );
  });

  test("with no menus yet, offers the create-first-menu CTA", () => {
    expect(menusPageState({ isLoading: false, data: [] })).toBe("empty");
  });

  test("with a menu, shows the page without the CTA", () => {
    expect(menusPageState({ isLoading: false, data: [MAIN] })).toBe("ready");
  });
});

describe("boundMenuSlug", () => {
  test("a location shows the menu it is bound to", () => {
    expect(boundMenuSlug(8, [MAIN, FOOTER])).toBe("footer");
  });

  test("an unbound location shows no menu", () => {
    expect(boundMenuSlug(null, [MAIN, FOOTER])).toBeNull();
  });

  test("a location bound to a menu not in the list shows no menu", () => {
    expect(boundMenuSlug(99, [MAIN, FOOTER])).toBeNull();
  });
});

describe("locationCheckbox", () => {
  test("a location bound to this menu is checked, and unchecking unbinds it", () => {
    expect(locationCheckbox(7, 7, "main")).toEqual({
      checked: true,
      toggleTo: null,
    });
  });

  test("a location bound to another menu is unchecked, and checking binds this one", () => {
    expect(locationCheckbox(8, 7, "main")).toEqual({
      checked: false,
      toggleTo: "main",
    });
  });

  test("an unbound location is unchecked, and checking binds this menu", () => {
    expect(locationCheckbox(null, 7, "main")).toEqual({
      checked: false,
      toggleTo: "main",
    });
  });
});

describe("termSlugFromSelect", () => {
  test("the empty option clears the binding", () => {
    expect(termSlugFromSelect(UNASSIGNED_VALUE)).toBeNull();
  });

  test("a menu option assigns that menu's slug", () => {
    expect(termSlugFromSelect("main")).toBe("main");
  });
});

describe("conflictShown", () => {
  test("a version_mismatch from a save shows the reload banner", () => {
    expect(conflictShown(versionMismatch(), null, 1)).toBe(true);
  });

  test("the banner stays dismissed for the version it was dismissed at", () => {
    expect(conflictShown(versionMismatch(), 2, 2)).toBe(false);
  });

  test("a new version_mismatch after a reload re-arms the banner", () => {
    expect(conflictShown(versionMismatch(), 1, 2)).toBe(true);
  });

  test("a conflict for another reason shows no banner", () => {
    const error = new ORPCError("CONFLICT", {
      data: { reason: "slug_taken" },
    });

    expect(conflictShown(error, null, 1)).toBe(false);
  });

  test("a save with no error shows no banner", () => {
    expect(conflictShown(null, null, 1)).toBe(false);
  });
});

describe("maxDepthRejected", () => {
  test("a max depth below the deepest item shows an error", () => {
    expect(maxDepthRejected("0", 1)).toBe(true);
  });

  test("a max depth the editor accepted shows no error", () => {
    expect(maxDepthRejected("3", 3)).toBe(false);
  });

  test("a field cleared mid-edit shows no error", () => {
    expect(maxDepthRejected("", 3)).toBe(false);
  });
});

describe("pickerPanelFor", () => {
  test("a plugin lookup kind's tab shows the unavailable panel and never searches", () => {
    expect(pickerPanelFor({ kind: "media", tabLabel: "Media" })).toEqual({
      panel: "unsupported",
    });
  });

  test("an entry tab searches its own entry type", () => {
    expect(
      pickerPanelFor({ kind: "entry", tabLabel: "Posts", target: "post" }),
    ).toEqual({ panel: "linked", kind: "entry", target: "post" });
  });

  test("the custom tab shows the custom URL form", () => {
    expect(pickerPanelFor({ kind: "custom", tabLabel: "Custom URL" })).toEqual({
      panel: "custom",
    });
  });
});

describe("searchResultsState", () => {
  test("a narrower search in flight shows loading, not the last results", () => {
    expect(
      searchResultsState({ isPending: true, isError: false, data: undefined }),
    ).toBe("loading");
  });

  test("a failed search says the results couldn't load", () => {
    expect(
      searchResultsState({ isPending: false, isError: true, data: undefined }),
    ).toBe("error");
  });

  test("a search with no matches says so", () => {
    expect(
      searchResultsState({
        isPending: false,
        isError: false,
        data: { items: [] },
      }),
    ).toBe("empty");
  });

  test("a search with matches lists them", () => {
    expect(
      searchResultsState({
        isPending: false,
        isError: false,
        data: { items: [{ id: "11", label: "About us" }] },
      }),
    ).toBe("results");
  });
});

describe("pickerChoice", () => {
  test("picking an entry adds it untitled, following the linked title", () => {
    expect(
      pickerChoice("entry", { id: "11", label: "About us" }, null).action,
    ).toEqual({
      type: "addItem",
      title: null,
      meta: { kind: "entry", entryId: 11 },
      linkedLabel: "About us",
    });
  });

  test("each add of a result is announced as an add, however often it repeats", () => {
    expect(
      pickerChoice("entry", { id: "11", label: "About us" }, null).announcement,
    ).toMatchObject({ message: "Added {label} to the menu" });
  });

  test("in re-link mode, picking a term replaces the item's link", () => {
    expect(
      pickerChoice("term", { id: "5", label: "Guides" }, "k1").action,
    ).toEqual({
      type: "relinkItem",
      key: "k1",
      newMeta: { kind: "term", termId: 5 },
      linkedLabel: "Guides",
    });
  });

  test("a re-link is announced as a replacement", () => {
    expect(
      pickerChoice("term", { id: "5", label: "Guides" }, "k1").announcement,
    ).toMatchObject({ message: "Replaced the link with {label}" });
  });
});

describe("linkedTargetText", () => {
  const item = {
    key: "k1",
    id: 1,
    parentKey: null,
    sortOrder: 0,
    title: null,
    state: "ok",
    resolvedLabel: "",
  } as const;

  test("names the linked target by its title when known", () => {
    expect(
      linkedTargetText({
        ...item,
        meta: { kind: "entry", entryId: 11 },
        linkedLabel: "About us",
      }),
    ).toMatchObject({
      message: "Links to {label}",
      values: { label: "About us" },
    });
  });

  test("names a linked entry by id when its title is unknown", () => {
    expect(
      linkedTargetText({
        ...item,
        meta: { kind: "entry", entryId: 11 },
        linkedLabel: null,
      }),
    ).toMatchObject({ message: "Links to entry #{id}", values: { id: 11 } });
  });

  test("names a linked term by id when its title is unknown", () => {
    expect(
      linkedTargetText({
        ...item,
        meta: { kind: "term", termId: 5 },
        linkedLabel: null,
      }),
    ).toMatchObject({ message: "Links to term #{id}", values: { id: 5 } });
  });

  test("a custom URL links to no target", () => {
    expect(
      linkedTargetText({
        ...item,
        meta: { kind: "custom", url: "/about" },
        linkedLabel: null,
      }),
    ).toBeNull();
  });
});

import { afterEach, describe, expect, test, vi } from "vitest";

import type {
  EntryMetaBoxManifestEntry,
  PlumixManifest,
  SettingsPageManifestEntry,
} from "@plumix/core/manifest";

import {
  findEntryTypeBySlug,
  findSettingsGroupByName,
  findSettingsPageByName,
  findTaxonomyByName,
  groupsForSettingsPage,
  entryMetaBoxesForType,
  readManifest,
  visibleEntryTypes,
  visibleSettingsPages,
  visibleTaxonomies,
} from "./manifest.js";

function withManifestScript(json: string): Document {
  const doc = document.implementation.createHTMLDocument("test");
  const script = doc.createElement("script");
  script.id = "plumix-manifest";
  script.type = "application/json";
  script.textContent = json;
  doc.body.appendChild(script);
  return doc;
}

describe("readManifest", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns empty manifest when the script tag is absent", () => {
    const doc = document.implementation.createHTMLDocument("test");
    expect(readManifest(doc)).toEqual({
      entryTypes: [],
      taxonomies: [],
      entryMetaBoxes: [], termMetaBoxes: [],
      settingsGroups: [],
      settingsPages: [],
    });
  });

  test("parses the injected JSON payload", () => {
    const doc = withManifestScript(
      JSON.stringify({
        entryTypes: [{ name: "post", label: "Posts" }],
      }),
    );
    expect(readManifest(doc)).toEqual({
      entryTypes: [{ name: "post", label: "Posts" }],
      taxonomies: [],
      entryMetaBoxes: [], termMetaBoxes: [],
      settingsGroups: [],
      settingsPages: [],
    });
  });

  test("empty payload falls back to empty manifest", () => {
    const doc = withManifestScript("");
    expect(readManifest(doc)).toEqual({
      entryTypes: [],
      taxonomies: [],
      entryMetaBoxes: [], termMetaBoxes: [],
      settingsGroups: [],
      settingsPages: [],
    });
  });

  test("malformed JSON logs and falls back without throwing", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // swallow expected error log
    });
    const doc = withManifestScript("{not-json");
    expect(readManifest(doc)).toEqual({
      entryTypes: [],
      taxonomies: [],
      entryMetaBoxes: [], termMetaBoxes: [],
      settingsGroups: [],
      settingsPages: [],
    });
    expect(errSpy).toHaveBeenCalledOnce();
  });

  test("non-array entryTypes coerces to empty array", () => {
    const doc = withManifestScript(JSON.stringify({ entryTypes: "oops" }));
    expect(readManifest(doc)).toEqual({
      entryTypes: [],
      taxonomies: [],
      entryMetaBoxes: [], termMetaBoxes: [],
      settingsGroups: [],
      settingsPages: [],
    });
  });

  test("non-array metaBoxes coerces to empty array", () => {
    const doc = withManifestScript(
      JSON.stringify({ entryTypes: [], metaBoxes: "oops" }),
    );
    expect(readManifest(doc)).toEqual({
      entryTypes: [],
      taxonomies: [],
      entryMetaBoxes: [], termMetaBoxes: [],
      settingsGroups: [],
      settingsPages: [],
    });
  });

  test("parses the injected JSON payload with metaBoxes", () => {
    const doc = withManifestScript(
      JSON.stringify({
        entryTypes: [],
        entryMetaBoxes: [
          {
            id: "seo",
            label: "SEO",
            entryTypes: ["post"],
            fields: [],
          },
        ],
      }),
    );
    expect(readManifest(doc)).toEqual({
      entryTypes: [],
      taxonomies: [],
      entryMetaBoxes: [
        {
          id: "seo",
          label: "SEO",
          entryTypes: ["post"],
          fields: [],
        },
      ],
      termMetaBoxes: [],
      settingsGroups: [],
      settingsPages: [],
    });
  });

  test("parses the injected JSON payload with taxonomies", () => {
    const doc = withManifestScript(
      JSON.stringify({
        entryTypes: [],
        taxonomies: [
          {
            name: "category",
            label: "Categories",
            isHierarchical: true,
          },
        ],
      }),
    );
    expect(readManifest(doc)).toEqual({
      entryTypes: [],
      taxonomies: [
        {
          name: "category",
          label: "Categories",
          isHierarchical: true,
        },
      ],
      entryMetaBoxes: [], termMetaBoxes: [],
      settingsGroups: [],
      settingsPages: [],
    });
  });

  test("non-array taxonomies coerces to empty array", () => {
    const doc = withManifestScript(
      JSON.stringify({ entryTypes: [], taxonomies: "not-an-array" }),
    );
    expect(readManifest(doc).taxonomies).toEqual([]);
  });
});

describe("findEntryTypeBySlug", () => {
  const source: PlumixManifest = {
    entryTypes: [
      { name: "post", adminSlug: "posts", label: "Posts" },
      { name: "product", adminSlug: "products", label: "Products" },
    ],
    taxonomies: [],
    entryMetaBoxes: [], termMetaBoxes: [],
    settingsGroups: [],
    settingsPages: [],
  };

  test("returns the matching entry", () => {
    expect(findEntryTypeBySlug("products", source)?.name).toBe("product");
  });

  test("returns undefined when no entry matches", () => {
    expect(findEntryTypeBySlug("nope", source)).toBeUndefined();
  });
});

describe("visibleEntryTypes", () => {
  const source: PlumixManifest = {
    entryTypes: [
      { name: "post", adminSlug: "posts", label: "Posts" },
      {
        name: "product",
        adminSlug: "products",
        label: "Products",
        capabilityType: "product",
      },
      {
        name: "news",
        adminSlug: "news",
        label: "News",
        capabilityType: "post",
      },
    ],
    taxonomies: [],
    entryMetaBoxes: [], termMetaBoxes: [],
    settingsGroups: [],
    settingsPages: [],
  };

  test("filters by `${capabilityType}:edit_own`; unset capabilityType uses name", () => {
    const caps = ["post:edit_own", "post:read"];
    const visible = visibleEntryTypes(caps, source).map((pt) => pt.name);
    // `post` → "post:edit_own" ✓; `news` shares capabilityType "post" ✓;
    // `product` needs "product:edit_own" which isn't granted ✗
    expect(visible).toEqual(["post", "news"]);
  });

  test("returns empty when no capabilities match", () => {
    expect(visibleEntryTypes([], source)).toEqual([]);
  });
});

describe("entryMetaBoxesForType", () => {
  const box = (
    id: string,
    overrides: Partial<EntryMetaBoxManifestEntry> = {},
  ): EntryMetaBoxManifestEntry => ({
    id,
    label: id,
    entryTypes: ["post"],
    fields: [],
    ...overrides,
  });

  test("returns boxes applicable to the post type, honours priority order", () => {
    const source: PlumixManifest = {
      taxonomies: [],
      entryTypes: [],
      entryMetaBoxes: [
        box("a", { priority: "low" }),
        box("b", { priority: "high" }),
        box("c"), // default
      ],
      termMetaBoxes: [],
      settingsGroups: [],
      settingsPages: [],
    };
    const ids = entryMetaBoxesForType("post", [], source).map((b) => b.id);
    expect(ids).toEqual(["b", "c", "a"]);
  });

  test("insertion order is the tiebreaker among boxes at the same priority", () => {
    const source: PlumixManifest = {
      taxonomies: [],
      entryTypes: [],
      entryMetaBoxes: [
        box("first", { priority: "high" }),
        box("second", { priority: "high" }),
      ],
      termMetaBoxes: [],
      settingsGroups: [],
      settingsPages: [],
    };
    const ids = entryMetaBoxesForType("post", [], source).map((b) => b.id);
    expect(ids).toEqual(["first", "second"]);
  });

  test("drops boxes whose `entryTypes` doesn't include the target", () => {
    const source: PlumixManifest = {
      taxonomies: [],
      entryTypes: [],
      entryMetaBoxes: [
        box("seo", { entryTypes: ["post"] }),
        box("shop", { entryTypes: ["product"] }),
      ],
      termMetaBoxes: [],
      settingsGroups: [],
      settingsPages: [],
    };
    const ids = entryMetaBoxesForType("post", [], source).map((b) => b.id);
    expect(ids).toEqual(["seo"]);
  });

  test("drops boxes gated by a capability the user lacks", () => {
    const source: PlumixManifest = {
      taxonomies: [],
      entryTypes: [],
      entryMetaBoxes: [
        box("public"),
        box("privileged", { capability: "post:edit_any" }),
      ],
      termMetaBoxes: [],
      settingsGroups: [],
      settingsPages: [],
    };
    const withoutCap = entryMetaBoxesForType("post", [], source).map(
      (b) => b.id,
    );
    expect(withoutCap).toEqual(["public"]);

    const withCap = entryMetaBoxesForType(
      "post",
      ["post:edit_any"],
      source,
    ).map((b) => b.id);
    expect(withCap).toEqual(["public", "privileged"]);
  });

  test("returns empty when no meta boxes are registered", () => {
    const source: PlumixManifest = {
      entryTypes: [],
      taxonomies: [],
      entryMetaBoxes: [], termMetaBoxes: [],
      settingsGroups: [],
      settingsPages: [],
    };
    expect(entryMetaBoxesForType("post", [], source)).toEqual([]);
  });
});

describe("findTaxonomyByName", () => {
  const source: PlumixManifest = {
    entryTypes: [],
    taxonomies: [
      { name: "category", label: "Categories", isHierarchical: true },
      { name: "tag", label: "Tags" },
    ],
    entryMetaBoxes: [], termMetaBoxes: [],
    settingsGroups: [],
    settingsPages: [],
  };

  test("returns the matching taxonomy", () => {
    expect(findTaxonomyByName("tag", source)?.label).toBe("Tags");
  });

  test("returns undefined when no taxonomy matches", () => {
    expect(findTaxonomyByName("mystery", source)).toBeUndefined();
  });
});

describe("visibleTaxonomies", () => {
  const source: PlumixManifest = {
    entryTypes: [],
    taxonomies: [
      { name: "category", label: "Categories" },
      { name: "tag", label: "Tags" },
      { name: "internal", label: "Internal" },
    ],
    entryMetaBoxes: [], termMetaBoxes: [],
    settingsGroups: [],
    settingsPages: [],
  };

  test("filters by per-taxonomy :read capability", () => {
    const caps = ["category:read", "tag:read"];
    const visible = visibleTaxonomies(caps, source).map((t) => t.name);
    expect(visible).toEqual(["category", "tag"]);
  });

  test("returns empty when the caller has no taxonomy :read caps", () => {
    expect(visibleTaxonomies(["post:edit_own"], source)).toEqual([]);
  });
});

describe("findSettingsPageByName + visibleSettingsPages + findSettingsGroupByName + groupsForSettingsPage", () => {
  const source: PlumixManifest = {
    entryTypes: [],
    taxonomies: [],
    entryMetaBoxes: [], termMetaBoxes: [],
    settingsGroups: [
      {
        name: "identity",
        label: "Site identity",
        fields: [
          { name: "site_title", label: "Site title", type: "text" },
          { name: "site_description", label: "Tagline", type: "text" },
        ],
      },
      {
        name: "contact",
        label: "Contact",
        fields: [{ name: "admin_email", label: "Admin email", type: "text" }],
      },
    ],
    settingsPages: [
      {
        name: "general",
        label: "General",
        groups: ["identity", "contact"],
      },
      {
        name: "billing",
        label: "Billing",
        groups: [],
      },
    ],
  };

  test("findSettingsPageByName returns the matching page", () => {
    expect(findSettingsPageByName("general", source)?.label).toBe("General");
  });

  test("findSettingsPageByName returns undefined when missing", () => {
    expect(findSettingsPageByName("mystery", source)).toBeUndefined();
  });

  test("visibleSettingsPages returns every page when caller has settings:manage", () => {
    expect(
      visibleSettingsPages(["settings:manage"], source).map((p) => p.name),
    ).toEqual(["general", "billing"]);
  });

  test("visibleSettingsPages returns empty when caller lacks settings:manage", () => {
    expect(visibleSettingsPages(["post:edit_own"], source)).toEqual([]);
    expect(visibleSettingsPages([], source)).toEqual([]);
  });

  test("findSettingsGroupByName resolves a group by name", () => {
    expect(findSettingsGroupByName("identity", source)?.label).toBe(
      "Site identity",
    );
    expect(findSettingsGroupByName("mystery", source)).toBeUndefined();
  });

  test("groupsForSettingsPage resolves each reference to its group entry", () => {
    const page = findSettingsPageByName("general", source);
    expect(page).toBeDefined();
    if (!page) return;
    const groups = groupsForSettingsPage(page, source);
    expect(groups.map((g) => g.name)).toEqual(["identity", "contact"]);
  });

  test("groupsForSettingsPage silently skips unresolved refs", () => {
    const orphan: SettingsPageManifestEntry = {
      name: "orphan",
      label: "Orphan",
      groups: ["identity", "nonexistent"],
    };
    expect(groupsForSettingsPage(orphan, source).map((g) => g.name)).toEqual([
      "identity",
    ]);
  });
});

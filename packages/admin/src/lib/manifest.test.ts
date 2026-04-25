import { afterEach, describe, expect, test, vi } from "vitest";

import type {
  EntryMetaBoxManifestEntry,
  PlumixManifest,
  SettingsPageManifestEntry,
  UserMetaBoxManifestEntry,
} from "@plumix/core/manifest";

import {
  entryMetaBoxesForType,
  findEntryTypeBySlug,
  findSettingsGroupByName,
  findSettingsPageByName,
  findTermTaxonomyByName,
  groupsForSettingsPage,
  readManifest,
  visibleEntryTypes,
  visibleSettingsPages,
  visibleTermTaxonomies,
  visibleUserMetaBoxes,
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
    expect(readManifest(doc)).toEqual({});
  });

  test("parses the injected JSON payload", () => {
    const doc = withManifestScript(
      JSON.stringify({
        entryTypes: [{ name: "post", label: "Posts" }],
      }),
    );
    expect(readManifest(doc)).toEqual({
      entryTypes: [{ name: "post", label: "Posts" }],
    });
  });

  test("empty payload falls back to empty manifest", () => {
    const doc = withManifestScript("");
    expect(readManifest(doc)).toEqual({});
  });

  test("malformed JSON logs and falls back without throwing", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // swallow expected error log
    });
    const doc = withManifestScript("{not-json");
    expect(readManifest(doc)).toEqual({});
    expect(errSpy).toHaveBeenCalledOnce();
  });

  test("non-array entryTypes coerces to empty array", () => {
    const doc = withManifestScript(JSON.stringify({ entryTypes: "oops" }));
    expect(readManifest(doc)).toEqual({});
  });

  test("non-array metaBoxes is dropped from the result", () => {
    const doc = withManifestScript(
      JSON.stringify({ entryTypes: [], entryMetaBoxes: "oops" }),
    );
    const result = readManifest(doc);
    expect(result.entryTypes).toEqual([]);
    expect(result.entryMetaBoxes).toBeUndefined();
  });

  test("parses the injected JSON payload with metaBoxes", () => {
    const doc = withManifestScript(
      JSON.stringify({
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
      entryMetaBoxes: [
        {
          id: "seo",
          label: "SEO",
          entryTypes: ["post"],
          fields: [],
        },
      ],
    });
  });

  test("parses the injected JSON payload with termTaxonomies", () => {
    const doc = withManifestScript(
      JSON.stringify({
        termTaxonomies: [
          {
            name: "category",
            label: "Categories",
            isHierarchical: true,
          },
        ],
      }),
    );
    expect(readManifest(doc)).toEqual({
      termTaxonomies: [
        {
          name: "category",
          label: "Categories",
          isHierarchical: true,
        },
      ],
    });
  });

  test("non-array termTaxonomies is dropped from the result", () => {
    const doc = withManifestScript(
      JSON.stringify({ entryTypes: [], termTaxonomies: "not-an-array" }),
    );
    expect(readManifest(doc).termTaxonomies).toBeUndefined();
  });
});

describe("findEntryTypeBySlug", () => {
  const source: PlumixManifest = {
    entryTypes: [
      { name: "post", adminSlug: "posts", label: "Posts" },
      { name: "product", adminSlug: "products", label: "Products" },
    ],
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
  };

  test("filters by `${capabilityType}:edit_own`; unset capabilityType uses name", () => {
    const caps = ["entry:post:edit_own", "entry:post:read"];
    const visible = visibleEntryTypes(caps, source).map((pt) => pt.name);
    // `post` → "entry:post:edit_own" ✓; `news` shares capabilityType "post" ✓;
    // `product` needs "entry:product:edit_own" which isn't granted ✗
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
      entryMetaBoxes: [
        box("a", { priority: 20 }),
        box("b", { priority: 0 }),
        box("c"), // unspecified → sorts last
      ],
    };
    const ids = entryMetaBoxesForType("post", [], source).map((b) => b.id);
    expect(ids).toEqual(["b", "a", "c"]);
  });

  test("boxes at the same priority break ties by id alphabetical", () => {
    const source: PlumixManifest = {
      entryMetaBoxes: [
        box("second", { priority: 0 }),
        box("first", { priority: 0 }),
      ],
    };
    const ids = entryMetaBoxesForType("post", [], source).map((b) => b.id);
    expect(ids).toEqual(["first", "second"]);
  });

  test("drops boxes whose `entryTypes` doesn't include the target", () => {
    const source: PlumixManifest = {
      entryMetaBoxes: [
        box("seo", { entryTypes: ["post"] }),
        box("shop", { entryTypes: ["product"] }),
      ],
    };
    const ids = entryMetaBoxesForType("post", [], source).map((b) => b.id);
    expect(ids).toEqual(["seo"]);
  });

  test("drops boxes gated by a capability the user lacks", () => {
    const source: PlumixManifest = {
      entryMetaBoxes: [
        box("public"),
        box("privileged", { capability: "entry:post:edit_any" }),
      ],
    };
    const withoutCap = entryMetaBoxesForType("post", [], source).map(
      (b) => b.id,
    );
    expect(withoutCap).toEqual(["public"]);

    const withCap = entryMetaBoxesForType(
      "post",
      ["entry:post:edit_any"],
      source,
    ).map((b) => b.id);
    expect(withCap).toEqual(["privileged", "public"]);
  });

  test("returns empty when no meta boxes are registered", () => {
    const source: PlumixManifest = {};
    expect(entryMetaBoxesForType("post", [], source)).toEqual([]);
  });
});

describe("visibleUserMetaBoxes", () => {
  function userBox(
    id: string,
    overrides: Partial<UserMetaBoxManifestEntry> = {},
  ): UserMetaBoxManifestEntry {
    return {
      id,
      label: id,
      fields: [],
      ...overrides,
    };
  }

  const source: PlumixManifest = {
    userMetaBoxes: [
      userBox("public"),
      userBox("privileged", { capability: "user:edit" }),
    ],
  };

  test("an undefined-capability box is visible regardless of viewer caps", () => {
    const ids = visibleUserMetaBoxes([], source).map((b) => b.id);
    expect(ids).toContain("public");
  });

  test("drops boxes gated by a capability the viewer lacks", () => {
    const ids = visibleUserMetaBoxes([], source).map((b) => b.id);
    expect(ids).toEqual(["public"]);
  });

  test("keeps capability-gated boxes when the viewer has the cap", () => {
    const ids = visibleUserMetaBoxes(["user:edit"], source).map((b) => b.id);
    expect(ids).toEqual(["privileged", "public"]);
  });

  test("returns empty when no user meta boxes are registered", () => {
    expect(visibleUserMetaBoxes(["user:edit"], {})).toEqual([]);
  });
});

describe("findTermTaxonomyByName", () => {
  const source: PlumixManifest = {
    termTaxonomies: [
      { name: "category", label: "Categories", isHierarchical: true },
      { name: "tag", label: "Tags" },
    ],
  };

  test("returns the matching taxonomy", () => {
    expect(findTermTaxonomyByName("tag", source)?.label).toBe("Tags");
  });

  test("returns undefined when no taxonomy matches", () => {
    expect(findTermTaxonomyByName("mystery", source)).toBeUndefined();
  });
});

describe("visibleTermTaxonomies", () => {
  const source: PlumixManifest = {
    termTaxonomies: [
      { name: "category", label: "Categories" },
      { name: "tag", label: "Tags" },
      { name: "internal", label: "Internal" },
    ],
  };

  test("filters by per-taxonomy :read capability", () => {
    const caps = ["term:category:read", "term:tag:read"];
    const visible = visibleTermTaxonomies(caps, source).map((t) => t.name);
    expect(visible).toEqual(["category", "tag"]);
  });

  test("returns empty when the caller has no taxonomy :read caps", () => {
    expect(visibleTermTaxonomies(["entry:post:edit_own"], source)).toEqual([]);
  });
});

describe("findSettingsPageByName + visibleSettingsPages + findSettingsGroupByName + groupsForSettingsPage", () => {
  const source: PlumixManifest = {
    settingsGroups: [
      {
        name: "identity",
        label: "Site identity",
        fields: [
          {
            key: "site_title",
            label: "Site title",
            type: "string",
            inputType: "text",
          },
          {
            key: "site_description",
            label: "Tagline",
            type: "string",
            inputType: "textarea",
          },
        ],
      },
      {
        name: "contact",
        label: "Contact",
        fields: [
          {
            key: "admin_email",
            label: "Admin email",
            type: "string",
            inputType: "email",
          },
        ],
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
    expect(visibleSettingsPages(["entry:post:edit_own"], source)).toEqual([]);
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

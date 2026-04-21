import { afterEach, describe, expect, test, vi } from "vitest";

import type {
  MetaBoxManifestEntry,
  PlumixManifest,
} from "@plumix/core/manifest";

import {
  allSettingsFields,
  findEntryTypeBySlug,
  findSettingsGroupByName,
  findTaxonomyByName,
  metaBoxesForEntryType,
  readManifest,
  visibleEntryTypes,
  visibleSettingsGroups,
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
      metaBoxes: [],
      settingsGroups: [],
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
      metaBoxes: [],
      settingsGroups: [],
    });
  });

  test("empty payload falls back to empty manifest", () => {
    const doc = withManifestScript("");
    expect(readManifest(doc)).toEqual({
      entryTypes: [],
      taxonomies: [],
      metaBoxes: [],
      settingsGroups: [],
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
      metaBoxes: [],
      settingsGroups: [],
    });
    expect(errSpy).toHaveBeenCalledOnce();
  });

  test("non-array entryTypes coerces to empty array", () => {
    const doc = withManifestScript(JSON.stringify({ entryTypes: "oops" }));
    expect(readManifest(doc)).toEqual({
      entryTypes: [],
      taxonomies: [],
      metaBoxes: [],
      settingsGroups: [],
    });
  });

  test("non-array metaBoxes coerces to empty array", () => {
    const doc = withManifestScript(
      JSON.stringify({ entryTypes: [], metaBoxes: "oops" }),
    );
    expect(readManifest(doc)).toEqual({
      entryTypes: [],
      taxonomies: [],
      metaBoxes: [],
      settingsGroups: [],
    });
  });

  test("parses the injected JSON payload with metaBoxes", () => {
    const doc = withManifestScript(
      JSON.stringify({
        entryTypes: [],
        metaBoxes: [
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
      metaBoxes: [
        {
          id: "seo",
          label: "SEO",
          entryTypes: ["post"],
          fields: [],
        },
      ],
      settingsGroups: [],
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
      metaBoxes: [],
      settingsGroups: [],
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
      { name: "post", adminSlug: "entries", label: "Posts" },
      { name: "product", adminSlug: "products", label: "Products" },
    ],
    taxonomies: [],
    metaBoxes: [],
    settingsGroups: [],
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
      { name: "post", adminSlug: "entries", label: "Posts" },
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
    metaBoxes: [],
    settingsGroups: [],
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

describe("metaBoxesForEntryType", () => {
  const box = (
    id: string,
    overrides: Partial<MetaBoxManifestEntry> = {},
  ): MetaBoxManifestEntry => ({
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
      metaBoxes: [
        box("a", { priority: "low" }),
        box("b", { priority: "high" }),
        box("c"), // default
      ],
      settingsGroups: [],
    };
    const ids = metaBoxesForEntryType("post", [], source).map((b) => b.id);
    expect(ids).toEqual(["b", "c", "a"]);
  });

  test("insertion order is the tiebreaker among boxes at the same priority", () => {
    const source: PlumixManifest = {
      taxonomies: [],
      entryTypes: [],
      metaBoxes: [
        box("first", { priority: "high" }),
        box("second", { priority: "high" }),
      ],
      settingsGroups: [],
    };
    const ids = metaBoxesForEntryType("post", [], source).map((b) => b.id);
    expect(ids).toEqual(["first", "second"]);
  });

  test("drops boxes whose `entryTypes` doesn't include the target", () => {
    const source: PlumixManifest = {
      taxonomies: [],
      entryTypes: [],
      metaBoxes: [
        box("seo", { entryTypes: ["post"] }),
        box("shop", { entryTypes: ["product"] }),
      ],
      settingsGroups: [],
    };
    const ids = metaBoxesForEntryType("post", [], source).map((b) => b.id);
    expect(ids).toEqual(["seo"]);
  });

  test("drops boxes gated by a capability the user lacks", () => {
    const source: PlumixManifest = {
      taxonomies: [],
      entryTypes: [],
      metaBoxes: [
        box("public"),
        box("privileged", { capability: "post:edit_any" }),
      ],
      settingsGroups: [],
    };
    const withoutCap = metaBoxesForEntryType("post", [], source).map(
      (b) => b.id,
    );
    expect(withoutCap).toEqual(["public"]);

    const withCap = metaBoxesForEntryType(
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
      metaBoxes: [],
      settingsGroups: [],
    };
    expect(metaBoxesForEntryType("post", [], source)).toEqual([]);
  });
});

describe("findTaxonomyByName", () => {
  const source: PlumixManifest = {
    entryTypes: [],
    taxonomies: [
      { name: "category", label: "Categories", isHierarchical: true },
      { name: "tag", label: "Tags" },
    ],
    metaBoxes: [],
    settingsGroups: [],
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
    metaBoxes: [],
    settingsGroups: [],
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

describe("findSettingsGroupByName + visibleSettingsGroups + allSettingsFields", () => {
  const source: PlumixManifest = {
    entryTypes: [],
    taxonomies: [],
    metaBoxes: [],
    settingsGroups: [
      {
        name: "general",
        label: "General",
        fieldsets: [
          {
            name: "identity",
            fields: [
              { name: "site_title", label: "Site title", type: "text" },
              { name: "site_description", label: "Tagline", type: "text" },
            ],
          },
          {
            name: "contact",
            fields: [
              { name: "admin_email", label: "Admin email", type: "text" },
            ],
          },
        ],
      },
      {
        name: "billing",
        label: "Billing",
        fieldsets: [],
      },
    ],
  };

  test("findSettingsGroupByName returns the matching group", () => {
    expect(findSettingsGroupByName("general", source)?.label).toBe("General");
  });

  test("findSettingsGroupByName returns undefined when missing", () => {
    expect(findSettingsGroupByName("mystery", source)).toBeUndefined();
  });

  test("visibleSettingsGroups returns every group when caller has option:manage", () => {
    const visible = visibleSettingsGroups(["option:manage"], source).map(
      (g) => g.name,
    );
    expect(visible).toEqual(["general", "billing"]);
  });

  test("visibleSettingsGroups returns empty when caller lacks option:manage", () => {
    expect(visibleSettingsGroups(["post:edit_own"], source)).toEqual([]);
    expect(visibleSettingsGroups([], source)).toEqual([]);
  });

  test("allSettingsFields flattens fieldsets in declared order", () => {
    const general = findSettingsGroupByName("general", source);
    expect(general).toBeDefined();
    if (!general) return;
    expect(allSettingsFields(general).map((f) => f.name)).toEqual([
      "site_title",
      "site_description",
      "admin_email",
    ]);
  });
});

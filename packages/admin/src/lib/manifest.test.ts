import { afterEach, describe, expect, test, vi } from "vitest";

import type {
  MetaBoxManifestEntry,
  PlumixManifest,
} from "@plumix/core/manifest";

import {
  findPostTypeBySlug,
  findTaxonomyByName,
  metaBoxesForPostType,
  readManifest,
  visiblePostTypes,
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
      postTypes: [],
      taxonomies: [],
      metaBoxes: [],
    });
  });

  test("parses the injected JSON payload", () => {
    const doc = withManifestScript(
      JSON.stringify({
        postTypes: [{ name: "post", label: "Posts" }],
      }),
    );
    expect(readManifest(doc)).toEqual({
      postTypes: [{ name: "post", label: "Posts" }],
      taxonomies: [],
      metaBoxes: [],
    });
  });

  test("empty payload falls back to empty manifest", () => {
    const doc = withManifestScript("");
    expect(readManifest(doc)).toEqual({
      postTypes: [],
      taxonomies: [],
      metaBoxes: [],
    });
  });

  test("malformed JSON logs and falls back without throwing", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // swallow expected error log
    });
    const doc = withManifestScript("{not-json");
    expect(readManifest(doc)).toEqual({
      postTypes: [],
      taxonomies: [],
      metaBoxes: [],
    });
    expect(errSpy).toHaveBeenCalledOnce();
  });

  test("non-array postTypes coerces to empty array", () => {
    const doc = withManifestScript(JSON.stringify({ postTypes: "oops" }));
    expect(readManifest(doc)).toEqual({
      postTypes: [],
      taxonomies: [],
      metaBoxes: [],
    });
  });

  test("non-array metaBoxes coerces to empty array", () => {
    const doc = withManifestScript(
      JSON.stringify({ postTypes: [], metaBoxes: "oops" }),
    );
    expect(readManifest(doc)).toEqual({
      postTypes: [],
      taxonomies: [],
      metaBoxes: [],
    });
  });

  test("parses the injected JSON payload with metaBoxes", () => {
    const doc = withManifestScript(
      JSON.stringify({
        postTypes: [],
        metaBoxes: [
          {
            id: "seo",
            label: "SEO",
            postTypes: ["post"],
            fields: [],
          },
        ],
      }),
    );
    expect(readManifest(doc)).toEqual({
      postTypes: [],
      taxonomies: [],
      metaBoxes: [
        {
          id: "seo",
          label: "SEO",
          postTypes: ["post"],
          fields: [],
        },
      ],
    });
  });

  test("parses the injected JSON payload with taxonomies", () => {
    const doc = withManifestScript(
      JSON.stringify({
        postTypes: [],
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
      postTypes: [],
      taxonomies: [
        {
          name: "category",
          label: "Categories",
          isHierarchical: true,
        },
      ],
      metaBoxes: [],
    });
  });

  test("non-array taxonomies coerces to empty array", () => {
    const doc = withManifestScript(
      JSON.stringify({ postTypes: [], taxonomies: "not-an-array" }),
    );
    expect(readManifest(doc).taxonomies).toEqual([]);
  });
});

describe("findPostTypeBySlug", () => {
  const source: PlumixManifest = {
    postTypes: [
      { name: "post", adminSlug: "posts", label: "Posts" },
      { name: "product", adminSlug: "products", label: "Products" },
    ],
    taxonomies: [],
    metaBoxes: [],
  };

  test("returns the matching entry", () => {
    expect(findPostTypeBySlug("products", source)?.name).toBe("product");
  });

  test("returns undefined when no entry matches", () => {
    expect(findPostTypeBySlug("nope", source)).toBeUndefined();
  });
});

describe("visiblePostTypes", () => {
  const source: PlumixManifest = {
    postTypes: [
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
    metaBoxes: [],
  };

  test("filters by `${capabilityType}:edit_own`; unset capabilityType uses name", () => {
    const caps = ["post:edit_own", "post:read"];
    const visible = visiblePostTypes(caps, source).map((pt) => pt.name);
    // `post` → "post:edit_own" ✓; `news` shares capabilityType "post" ✓;
    // `product` needs "product:edit_own" which isn't granted ✗
    expect(visible).toEqual(["post", "news"]);
  });

  test("returns empty when no capabilities match", () => {
    expect(visiblePostTypes([], source)).toEqual([]);
  });
});

describe("metaBoxesForPostType", () => {
  const box = (
    id: string,
    overrides: Partial<MetaBoxManifestEntry> = {},
  ): MetaBoxManifestEntry => ({
    id,
    label: id,
    postTypes: ["post"],
    fields: [],
    ...overrides,
  });

  test("returns boxes applicable to the post type, honours priority order", () => {
    const source: PlumixManifest = {
      taxonomies: [],
      postTypes: [],
      metaBoxes: [
        box("a", { priority: "low" }),
        box("b", { priority: "high" }),
        box("c"), // default
      ],
    };
    const ids = metaBoxesForPostType("post", [], source).map((b) => b.id);
    expect(ids).toEqual(["b", "c", "a"]);
  });

  test("insertion order is the tiebreaker among boxes at the same priority", () => {
    const source: PlumixManifest = {
      taxonomies: [],
      postTypes: [],
      metaBoxes: [
        box("first", { priority: "high" }),
        box("second", { priority: "high" }),
      ],
    };
    const ids = metaBoxesForPostType("post", [], source).map((b) => b.id);
    expect(ids).toEqual(["first", "second"]);
  });

  test("drops boxes whose `postTypes` doesn't include the target", () => {
    const source: PlumixManifest = {
      taxonomies: [],
      postTypes: [],
      metaBoxes: [
        box("seo", { postTypes: ["post"] }),
        box("shop", { postTypes: ["product"] }),
      ],
    };
    const ids = metaBoxesForPostType("post", [], source).map((b) => b.id);
    expect(ids).toEqual(["seo"]);
  });

  test("drops boxes gated by a capability the user lacks", () => {
    const source: PlumixManifest = {
      taxonomies: [],
      postTypes: [],
      metaBoxes: [
        box("public"),
        box("privileged", { capability: "post:edit_any" }),
      ],
    };
    const withoutCap = metaBoxesForPostType("post", [], source).map(
      (b) => b.id,
    );
    expect(withoutCap).toEqual(["public"]);

    const withCap = metaBoxesForPostType("post", ["post:edit_any"], source).map(
      (b) => b.id,
    );
    expect(withCap).toEqual(["public", "privileged"]);
  });

  test("returns empty when no meta boxes are registered", () => {
    const source: PlumixManifest = {
      postTypes: [],
      taxonomies: [],
      metaBoxes: [],
    };
    expect(metaBoxesForPostType("post", [], source)).toEqual([]);
  });
});

describe("findTaxonomyByName", () => {
  const source: PlumixManifest = {
    postTypes: [],
    taxonomies: [
      { name: "category", label: "Categories", isHierarchical: true },
      { name: "tag", label: "Tags" },
    ],
    metaBoxes: [],
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
    postTypes: [],
    taxonomies: [
      { name: "category", label: "Categories" },
      { name: "tag", label: "Tags" },
      { name: "internal", label: "Internal" },
    ],
    metaBoxes: [],
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

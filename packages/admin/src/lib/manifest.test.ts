import { afterEach, describe, expect, test, vi } from "vitest";

import type {
  MetaBoxManifestEntry,
  PlumixManifest,
} from "@plumix/core/manifest";

import {
  findPostTypeBySlug,
  metaBoxesForPostType,
  readManifest,
  visiblePostTypes,
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
    expect(readManifest(doc)).toEqual({ postTypes: [], metaBoxes: [] });
  });

  test("parses the injected JSON payload", () => {
    const doc = withManifestScript(
      JSON.stringify({
        postTypes: [{ name: "post", label: "Posts" }],
      }),
    );
    expect(readManifest(doc)).toEqual({
      postTypes: [{ name: "post", label: "Posts" }],
      metaBoxes: [],
    });
  });

  test("empty payload falls back to empty manifest", () => {
    const doc = withManifestScript("");
    expect(readManifest(doc)).toEqual({ postTypes: [], metaBoxes: [] });
  });

  test("malformed JSON logs and falls back without throwing", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // swallow expected error log
    });
    const doc = withManifestScript("{not-json");
    expect(readManifest(doc)).toEqual({ postTypes: [], metaBoxes: [] });
    expect(errSpy).toHaveBeenCalledOnce();
  });

  test("non-array postTypes coerces to empty array", () => {
    const doc = withManifestScript(JSON.stringify({ postTypes: "oops" }));
    expect(readManifest(doc)).toEqual({ postTypes: [], metaBoxes: [] });
  });

  test("non-array metaBoxes coerces to empty array", () => {
    const doc = withManifestScript(
      JSON.stringify({ postTypes: [], metaBoxes: "oops" }),
    );
    expect(readManifest(doc)).toEqual({ postTypes: [], metaBoxes: [] });
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
});

describe("findPostTypeBySlug", () => {
  const source: PlumixManifest = {
    postTypes: [
      { name: "post", adminSlug: "posts", label: "Posts" },
      { name: "product", adminSlug: "products", label: "Products" },
    ],
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
    const source: PlumixManifest = { postTypes: [], metaBoxes: [] };
    expect(metaBoxesForPostType("post", [], source)).toEqual([]);
  });
});

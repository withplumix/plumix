import { afterEach, describe, expect, test, vi } from "vitest";

import type { PlumixManifest } from "@plumix/core/manifest";

import {
  findPostTypeBySlug,
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
    expect(readManifest(doc)).toEqual({ postTypes: [] });
  });

  test("parses the injected JSON payload", () => {
    const doc = withManifestScript(
      JSON.stringify({
        postTypes: [{ name: "post", label: "Posts" }],
      }),
    );
    expect(readManifest(doc)).toEqual({
      postTypes: [{ name: "post", label: "Posts" }],
    });
  });

  test("empty payload falls back to empty manifest", () => {
    const doc = withManifestScript("");
    expect(readManifest(doc)).toEqual({ postTypes: [] });
  });

  test("malformed JSON logs and falls back without throwing", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // swallow expected error log
    });
    const doc = withManifestScript("{not-json");
    expect(readManifest(doc)).toEqual({ postTypes: [] });
    expect(errSpy).toHaveBeenCalledOnce();
  });

  test("non-array postTypes coerces to empty array", () => {
    const doc = withManifestScript(JSON.stringify({ postTypes: "oops" }));
    expect(readManifest(doc)).toEqual({ postTypes: [] });
  });
});

describe("findPostTypeBySlug", () => {
  const source: PlumixManifest = {
    postTypes: [
      { name: "post", adminSlug: "posts", label: "Posts" },
      { name: "product", adminSlug: "products", label: "Products" },
    ],
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

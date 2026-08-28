import { describe, expect, test } from "vitest";

import { readSeoOverrides, SEO_META_KEYS } from "./overrides.js";

describe("readSeoOverrides", () => {
  test("an empty bag answers nothing set", () => {
    expect(readSeoOverrides({})).toEqual({
      title: null,
      description: null,
      canonical: null,
      ogImage: null,
      noindex: false,
      nofollow: false,
    });
  });

  test("a missing bag reads as an empty one", () => {
    expect(readSeoOverrides(undefined).title).toBeNull();
    expect(readSeoOverrides(null).noindex).toBe(false);
  });

  test("reads every key off its prefixed name", () => {
    expect(
      readSeoOverrides({
        [SEO_META_KEYS.title]: "Search title",
        [SEO_META_KEYS.description]: "Search description",
        [SEO_META_KEYS.canonical]: "https://elsewhere.example/post",
        [SEO_META_KEYS.ogImage]: "https://cms.example/share.png",
        [SEO_META_KEYS.noindex]: true,
        [SEO_META_KEYS.nofollow]: true,
      }),
    ).toEqual({
      title: "Search title",
      description: "Search description",
      canonical: "https://elsewhere.example/post",
      ogImage: "https://cms.example/share.png",
      noindex: true,
      nofollow: true,
    });
  });

  test("an empty string is no answer at all", () => {
    expect(
      readSeoOverrides({
        [SEO_META_KEYS.title]: "",
        [SEO_META_KEYS.canonical]: "",
      }),
    ).toMatchObject({ title: null, canonical: null });
  });

  test("a non-boolean flag does not hold a page out of the index", () => {
    expect(readSeoOverrides({ [SEO_META_KEYS.noindex]: "yes" }).noindex).toBe(
      false,
    );
  });

  test("every key carries the plugin's prefix", () => {
    for (const key of Object.values(SEO_META_KEYS)) {
      expect(key.startsWith("seo_")).toBe(true);
    }
  });
});

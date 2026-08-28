import { describe, expect, test } from "vitest";

import type { SerpPreview } from "./serp.js";
import { resolveSerp } from "./serp.js";

const preview: SerpPreview = {
  url: "https://cms.example/post/hello",
  title: "Hello – Demo",
  description: "My excerpt",
  indexable: true,
  reason: "default",
};

const NOTHING = { title: null, description: null, noindex: false };

describe("resolveSerp", () => {
  test("with nothing overridden the resolved page is what shows", () => {
    expect(resolveSerp(preview, NOTHING)).toEqual({
      title: "Hello – Demo",
      description: "My excerpt",
      indexable: true,
      reason: "default",
    });
  });

  test("an unsaved search title and description replace both lines", () => {
    expect(
      resolveSerp(preview, {
        title: "A different headline",
        description: "A different snippet",
        noindex: false,
      }),
    ).toMatchObject({
      title: "A different headline",
      description: "A different snippet",
    });
  });

  test("the noindex toggle excludes the page under its own reason", () => {
    expect(resolveSerp(preview, { ...NOTHING, noindex: true })).toMatchObject({
      indexable: false,
      reason: "entry_override",
    });
  });

  test("the toggle outranks a type held out of search, as the chain does", () => {
    const byType: SerpPreview = {
      ...preview,
      indexable: false,
      reason: "type_default",
    };

    expect(resolveSerp(byType, { ...NOTHING, noindex: true }).reason).toBe(
      "entry_override",
    );
  });

  test("a private site keeps its reason, whatever the toggle says", () => {
    const private_: SerpPreview = {
      ...preview,
      indexable: false,
      reason: "site_private",
    };

    expect(resolveSerp(private_, { ...NOTHING, noindex: true })).toMatchObject({
      indexable: false,
      reason: "site_private",
    });
  });
});

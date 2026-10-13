import { describe, expect, test } from "vitest";

import type { SerpPreview } from "./serp.js";
import { measureSerpLine, resolveSerp } from "./serp.js";

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

describe("measureSerpLine", () => {
  test("a line within the limit is counted and fits", () => {
    expect(measureSerpLine("Hello", 60)).toEqual({ length: 5, state: "fits" });
  });

  test("a line exactly at the limit still fits", () => {
    expect(measureSerpLine("x".repeat(60), 60)).toEqual({
      length: 60,
      state: "fits",
    });
  });

  test("a title past the limit will be cut short", () => {
    expect(measureSerpLine("x".repeat(61), 60)).toEqual({
      length: 61,
      state: "over",
    });
  });

  test("an empty line says it is empty", () => {
    expect(measureSerpLine("", 155)).toEqual({ length: 0, state: "empty" });
  });

  test("an emoji counts as the one character the author sees", () => {
    expect(measureSerpLine("Hi 👋", 60).length).toBe(4);
  });
});

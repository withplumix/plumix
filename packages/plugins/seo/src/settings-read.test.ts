import type { SettingsBag } from "plumix/schema";
import { describe, expect, test } from "vitest";

import { readSeoSettings } from "./settings.js";

const read = (
  own: SettingsBag = {},
  legacy: SettingsBag = {},
): ReturnType<typeof readSeoSettings> => readSeoSettings(own, legacy);

describe("readSeoSettings", () => {
  test("an empty site indexes everything but the thin pages", () => {
    expect(read()).toEqual({
      indexable: true,
      defaultOgImage: null,
      represents: "organization",
      separator: "·",
      titlePattern: null,
      typeTitlePatterns: new Map(),
      noindexTypes: new Set(),
      noindexTaxonomies: new Set(),
      indexSearch: false,
      indexPaginated: false,
      indexNotFound: false,
    });
  });

  test("reads a per-type title pattern off its namespaced key", () => {
    const settings = read({
      "type:post:title": "%%title%% %%sep%% %%sitename%%",
      "type:page:title": "%%title%%",
    });

    expect(settings.typeTitlePatterns).toEqual(
      new Map([
        ["post", "%%title%% %%sep%% %%sitename%%"],
        ["page", "%%title%%"],
      ]),
    );
  });

  test("a type or taxonomy is held out only by an explicit false", () => {
    const settings = read({
      "type:post:indexable": false,
      "type:page:indexable": true,
      "taxonomy:tag:indexable": false,
    });

    expect(settings.noindexTypes).toEqual(new Set(["post"]));
    expect(settings.noindexTaxonomies).toEqual(new Set(["tag"]));
  });

  test("an empty pattern is no pattern", () => {
    expect(read({ title_pattern: "", "type:post:title": "" })).toMatchObject({
      titlePattern: null,
      typeTitlePatterns: new Map(),
    });
  });

  test("the three thin-page arms are overridable", () => {
    expect(
      read({
        index_search: true,
        index_paginated: true,
        index_not_found: true,
      }),
    ).toMatchObject({
      indexSearch: true,
      indexPaginated: true,
      indexNotFound: true,
    });
  });

  test("a blank separator is honoured, an unset one defaults", () => {
    expect(read({ title_separator: "|" }).separator).toBe("|");
    expect(read({ title_separator: "" }).separator).toBe("");
    expect(read({}).separator).toBe("·");
  });

  test("the legacy site keys still answer for the two that moved", () => {
    expect(
      read({}, { public: false, default_og_image: "https://x.example/o.png" }),
    ).toMatchObject({
      indexable: false,
      defaultOgImage: "https://x.example/o.png",
    });
  });

  test("a key that is not one of ours is ignored", () => {
    expect(
      read({ "type:post": "x", "typeless:post:title": "y" }),
    ).toMatchObject({ typeTitlePatterns: new Map() });
  });
});

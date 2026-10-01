import { describe, expect, test } from "vitest";

import { startingMeta } from "../manifest-types.js";
import { group, number, repeater, text, toggle } from "./index.js";
import { toMetaBoxFieldEntry } from "./manifest-entry.js";

describe("startingMeta", () => {
  test("holds each field's default and leaves a field with none out", () => {
    const fields = [
      text("tone").default("warm").build(),
      number("rating").default(3).build(),
      toggle("featured").default(false).build(),
      text("subtitle").build(),
    ];
    expect(startingMeta(fields)).toEqual({
      tone: "warm",
      rating: 3,
      featured: false,
    });
  });

  test("a group's own default is its starting value", () => {
    const fields = [
      group("seo")
        .fields([text("title").default("From member"), text("robots")])
        .default({ title: "Untitled" })
        .build(),
    ];
    expect(startingMeta(fields)).toEqual({ seo: { title: "Untitled" } });
  });

  test("a group with no default of its own starts from its members' defaults", () => {
    const fields = [
      group("seo")
        .fields([
          text("title"),
          text("robots").default("index"),
          group("og").fields([text("type").default("website")]),
        ])
        .build(),
    ];
    expect(startingMeta(fields)).toEqual({
      seo: { robots: "index", og: { type: "website" } },
    });
  });

  test("a group with no default anywhere has no starting value", () => {
    const fields = [
      group("seo")
        .fields([text("title")])
        .build(),
    ];
    expect(startingMeta(fields)).toEqual({});
  });

  test("a repeater's default rows carry the subfield defaults", () => {
    const fields = [
      repeater("faq")
        .fields([text("q"), text("a").default("TBD")])
        .default([{ q: "What is Plumix?" }, { q: "Why?", a: "Because." }])
        .build(),
    ];
    expect(startingMeta(fields)).toEqual({
      faq: [
        { q: "What is Plumix?", a: "TBD" },
        { q: "Why?", a: "Because." },
      ],
    });
  });

  test("reads the admin's wire entries the same as the server's fields", () => {
    const fields = [
      text("tone").default("warm").build(),
      group("seo")
        .fields([text("robots").default("index")])
        .build(),
    ];
    expect(startingMeta(fields.map(toMetaBoxFieldEntry))).toEqual({
      tone: "warm",
      seo: { robots: "index" },
    });
  });
});

import { describe, expectTypeOf, test } from "vitest";

import type {
  EntryReferenceSummary,
  TermReferenceSummary,
  UserReferenceSummary,
} from "../lookup.js";
import type { InferFields } from "./contributions.js";
import type { LinkValue } from "./link.js";
import {
  color,
  date,
  email,
  entry,
  group,
  json,
  link,
  number,
  range,
  repeater,
  richtext,
  select,
  term,
  text,
  toggle,
  user,
} from "./index.js";

// A cleared field stays empty, so `.default()` cannot promise a value on
// read; only `.required()` narrows.
describe("`.default()` leaves the read type optional", () => {
  test("text-family", () => {
    const _defaulted = text("a").default("x");
    expectTypeOf<(typeof _defaulted)["_value"]>().toEqualTypeOf<
      string | undefined
    >();
    const _email = email("a").default("a@b.c");
    expectTypeOf<(typeof _email)["_value"]>().toEqualTypeOf<
      string | undefined
    >();
    const _both = text("a").required().default("x");
    expectTypeOf<(typeof _both)["_value"]>().toEqualTypeOf<string>();
    const _reversed = text("a").default("x").required();
    expectTypeOf<(typeof _reversed)["_value"]>().toEqualTypeOf<string>();
  });

  test("number and range", () => {
    const _number = number("n").default(3);
    expectTypeOf<(typeof _number)["_value"]>().toEqualTypeOf<
      number | undefined
    >();
    const _numberBoth = number("n").required().default(3);
    expectTypeOf<(typeof _numberBoth)["_value"]>().toEqualTypeOf<number>();
    const _range = range("r").bounds(0, 10).default(3);
    expectTypeOf<(typeof _range)["_value"]>().toEqualTypeOf<
      number | undefined
    >();
    const _rangeBoth = range("r").bounds(0, 10).required().default(3);
    expectTypeOf<(typeof _rangeBoth)["_value"]>().toEqualTypeOf<number>();
  });

  test("color", () => {
    const _color = color("c").default("#fff");
    expectTypeOf<(typeof _color)["_value"]>().toEqualTypeOf<
      string | undefined
    >();
    const _both = color("c").required().default("#fff");
    expectTypeOf<(typeof _both)["_value"]>().toEqualTypeOf<string>();
  });

  test("link", () => {
    const _link = link("l").default({ url: "/" });
    expectTypeOf<(typeof _link)["_value"]>().toEqualTypeOf<
      LinkValue | undefined
    >();
    const _both = link("l").required().default({ url: "/" });
    expectTypeOf<(typeof _both)["_value"]>().toEqualTypeOf<LinkValue>();
  });

  test("temporal", () => {
    const _date = date("d").default("2026-01-01");
    expectTypeOf<(typeof _date)["_value"]>().toEqualTypeOf<
      string | undefined
    >();
    const _asDate = date("d").returns("date").default("2026-01-01");
    expectTypeOf<(typeof _asDate)["_value"]>().toEqualTypeOf<
      Date | undefined
    >();
    const _both = date("d").returns("date").required().default("2026-01-01");
    expectTypeOf<(typeof _both)["_value"]>().toEqualTypeOf<Date>();
  });

  test("toggle", () => {
    const _toggle = toggle("t").default(false);
    expectTypeOf<(typeof _toggle)["_value"]>().toEqualTypeOf<
      boolean | undefined
    >();
    const _both = toggle("t").required().default(false);
    expectTypeOf<(typeof _both)["_value"]>().toEqualTypeOf<boolean>();
  });

  test("select", () => {
    const _single = select("s").options(["a", "b"]).default("a");
    expectTypeOf<(typeof _single)["_value"]>().toEqualTypeOf<
      "a" | "b" | undefined
    >();
    const _multi = select("s").options(["a", "b"]).multiple().default(["a"]);
    expectTypeOf<(typeof _multi)["_value"]>().toEqualTypeOf<
      readonly ("a" | "b")[] | undefined
    >();
    const _both = select("s").options(["a", "b"]).required().default("a");
    expectTypeOf<(typeof _both)["_value"]>().toEqualTypeOf<"a" | "b">();
  });

  // `.default()` leaves the read type exactly as the same chain without it,
  // and that type still holds `undefined`.
  test("group and repeater", () => {
    const _group = group("seo").fields([text("title")]);
    const _groupDefaulted = _group.default({ title: "Untitled" });
    expectTypeOf<(typeof _groupDefaulted)["_value"]>().toEqualTypeOf<
      (typeof _group)["_value"]
    >();
    expectTypeOf<
      Extract<(typeof _groupDefaulted)["_value"], undefined>
    >().toEqualTypeOf<undefined>();

    const _repeater = repeater("faq").fields([text("q")]);
    const _repeaterDefaulted = _repeater.default([{ q: "Why?" }]);
    expectTypeOf<(typeof _repeaterDefaulted)["_value"]>().toEqualTypeOf<
      (typeof _repeater)["_value"]
    >();
    expectTypeOf<
      Extract<(typeof _repeaterDefaulted)["_value"], undefined>
    >().toEqualTypeOf<undefined>();

    const _requiredRepeater = repeater("faq")
      .fields([text("q")])
      .required();
    expectTypeOf<
      Extract<ReturnType<typeof _requiredRepeater.default>["_value"], undefined>
    >().toEqualTypeOf<never>();
  });

  test("references", () => {
    const _user = user("owner").default("1");
    expectTypeOf<(typeof _user)["_value"]>().toEqualTypeOf<
      UserReferenceSummary | undefined
    >();
    const _entry = entry("related", ["post"]).default("1");
    expectTypeOf<(typeof _entry)["_value"]>().toEqualTypeOf<
      EntryReferenceSummary | undefined
    >();
    const _terms = term("topics", ["category"]).multiple().default(["1"]);
    expectTypeOf<(typeof _terms)["_value"]>().toEqualTypeOf<
      readonly TermReferenceSummary[] | undefined
    >();
    const _requiredTerms = term("topics", ["category"])
      .multiple()
      .required()
      .default(["1"]);
    expectTypeOf<(typeof _requiredTerms)["_value"]>().toEqualTypeOf<
      readonly TermReferenceSummary[]
    >();
  });

  // Their read type is `unknown`, which already holds `undefined`;
  // `.default()` must not change it.
  test("json and richtext", () => {
    const _json = json("data").default({ a: 1 });
    expectTypeOf<(typeof _json)["_value"]>().toEqualTypeOf<unknown>();
    const _richtext = richtext("body").default({ type: "doc" });
    expectTypeOf<(typeof _richtext)["_value"]>().toEqualTypeOf<unknown>();
  });

  test("InferFields narrows on `.required()` only", () => {
    const _fields = [
      text("tone").default("warm"),
      text("title").required(),
      number("rating").required().default(3),
    ] as const;
    type Read = InferFields<typeof _fields>;
    expectTypeOf<Read["tone"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Read["title"]>().toEqualTypeOf<string>();
    expectTypeOf<Read["rating"]>().toEqualTypeOf<number>();
  });
});

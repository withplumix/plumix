import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { FormItemSpan } from "./form.js";
import { FormItem } from "./form.js";

function spanClasses(span: FormItemSpan | undefined): string[] {
  const markup = renderToStaticMarkup(<FormItem span={span} />);
  const classes = /class="([^"]*)"/.exec(markup)?.[1]?.split(" ") ?? [];
  return classes.filter((name) => name.includes("col-span-"));
}

describe("FormItem span", () => {
  test("omitted span leaves the item out of any column", () => {
    expect(spanClasses(undefined)).toEqual([]);
  });

  test("plain number sets the base span", () => {
    expect(spanClasses(6)).toEqual(["col-span-6"]);
  });

  test("responsive object emits mobile-first breakpoints in order", () => {
    expect(spanClasses({ base: 12, sm: 6, md: 4, lg: 3 })).toEqual([
      "col-span-12",
      "@sm:col-span-6",
      "@md:col-span-4",
      "@lg:col-span-3",
    ]);
  });

  test("object without base falls back to full width", () => {
    expect(spanClasses({ md: 6 })).toEqual(["col-span-12", "@md:col-span-6"]);
  });

  test("only sets classes for breakpoints that were provided", () => {
    expect(spanClasses({ base: 6, lg: 3 })).toEqual([
      "col-span-6",
      "@lg:col-span-3",
    ]);
  });

  test("clamps values outside 1..12", () => {
    expect(spanClasses(0)).toEqual(["col-span-1"]);
    expect(spanClasses(99)).toEqual(["col-span-12"]);
    expect(spanClasses({ base: -3, md: 200 })).toEqual([
      "col-span-1",
      "@md:col-span-12",
    ]);
  });

  test("rounds fractional spans", () => {
    expect(spanClasses(5.7)).toEqual(["col-span-6"]);
  });

  test("non-finite numbers fall back to full width", () => {
    expect(spanClasses(Number.NaN)).toEqual(["col-span-12"]);
  });
});

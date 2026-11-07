import { describe, expect, expectTypeOf, test } from "vitest";

import type { FiltersFake } from "./filters-fake.js";
import { defineFilter } from "../events-and-filters/define.js";
import { scopeDeclarations } from "../events-and-filters/scope.js";
import { fakeFilters } from "./filters-fake.js";

const price = {
  total: defineFilter<number, { readonly currency: string }>("shop:total", {
    sync: true,
  }),
  label: defineFilter<string>("shop:label", { sync: false }),
};

describe("assertApplied", () => {
  test("passes for a filter applied with an input that has the keys asked for", () => {
    const filters = fakeFilters();
    filters.record(price.total, { currency: "EUR" });

    expect(() => {
      filters.assertApplied(price.total, { currency: "EUR" });
    }).not.toThrow();
  });

  test("fails for another input, listing the filters applied", () => {
    const filters = fakeFilters();
    filters.record(price.total, { currency: "EUR" });

    expect(() => {
      filters.assertApplied(price.total, { currency: "USD" });
    }).toThrow(
      'Expected filter "shop:total" to be applied with {"currency":"USD"}, but it was not.\nApplied:\n  - "shop:total" {"currency":"EUR"}',
    );
  });

  test("says nothing was applied when the site applied nothing", () => {
    const filters = fakeFilters();

    expect(() => {
      filters.assertApplied(price.label);
    }).toThrow(
      'Expected filter "shop:label" to be applied, but it was not.\nApplied: nothing.',
    );
  });

  test("passes for an unscoped filter applied for any name", () => {
    const filters = fakeFilters();
    filters.record(scopeDeclarations(price, "gift").label, undefined);

    expect(() => {
      filters.assertApplied(price.label);
    }).not.toThrow();
  });

  test("takes the declared filter, not its id", () => {
    expectTypeOf<string>().not.toExtend<
      Parameters<FiltersFake["assertApplied"]>[0]
    >();
  });
});

describe("assertNotApplied", () => {
  test("passes when only another filter was applied", () => {
    const filters = fakeFilters();
    filters.record(price.total, { currency: "EUR" });

    expect(() => {
      filters.assertNotApplied(price.label);
    }).not.toThrow();
  });

  test("passes for a filter applied only for another name", () => {
    const filters = fakeFilters();
    filters.record(price.label, undefined);

    expect(() => {
      filters.assertNotApplied(scopeDeclarations(price, "gift").label);
    }).not.toThrow();
  });

  test("fails for an applied filter, saying how often", () => {
    const filters = fakeFilters();
    filters.record(price.label, undefined);
    filters.record(price.label, undefined);

    expect(() => {
      filters.assertNotApplied(price.label);
    }).toThrow(
      'Expected filter "shop:label" not to be applied, but it was 2 times.\nApplied:\n  - "shop:label" undefined\n  - "shop:label" undefined',
    );
  });
});

import { describe, expectTypeOf, test } from "vitest";

import type { AppContext } from "../context/app-context.js";
import type { Entry, EntryStatus, NewEntry } from "../db/schema/entries.js";
import type { Term } from "../db/schema/terms.js";
import type { MetaChanges } from "../meta/contract/bags.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { createPluginSetupContext } from "../plugin/setup-context.js";
import { entry } from "./entry.js";
import { HookRegistry } from "./registry.js";
import { term } from "./term.js";

const ctx = createPluginSetupContext({
  pluginId: "acme",
  hooks: new HookRegistry(),
  registry: createPluginRegistry(),
  theme: { templates: [] },
});

describe("entry", () => {
  test("an event handler is handed its payload by glossary key, and the ctx", () => {
    ctx.events.on(entry.published, (payload, handlerCtx) => {
      expectTypeOf(payload).toEqualTypeOf<{ readonly entry: Entry }>();
      expectTypeOf(handlerCtx).toEqualTypeOf<AppContext>();
    });
    ctx.events.on(entry.updated, ({ previous }) => {
      expectTypeOf(previous).toEqualTypeOf<Entry>();
    });
    ctx.events.on(entry.transition, ({ previousStatus }) => {
      expectTypeOf(previousStatus).toEqualTypeOf<EntryStatus>();
    });
    ctx.events.on(entry.metaChanged, ({ entry: row, changes }) => {
      expectTypeOf(row).toEqualTypeOf<{
        readonly id: number;
        readonly type: string;
      }>();
      expectTypeOf(changes).toEqualTypeOf<MetaChanges>();
    });
  });

  test("a before-save handler returns the row it was handed", () => {
    ctx.filters.add(entry.beforeSave, (row) => {
      expectTypeOf(row).toEqualTypeOf<NewEntry>();
      return Promise.resolve(row);
    });
  });

  test("a type's scope has the shape of the handle its registration returns", () => {
    const product = ctx.registerEntryType("product", { label: "Products" });

    expectTypeOf(entry.for("product")).toEqualTypeOf(product);
    expectTypeOf(product.published).toEqualTypeOf(entry.published);
  });

  test("a before-save filter can't be passed to events.on", () => {
    // @ts-expect-error a filter is not an event
    ctx.events.on(entry.beforeSave, () => undefined);
  });
});

describe("term", () => {
  test("an event handler is handed its payload by glossary key", () => {
    ctx.events.on(term.updated, ({ term: row, previous }) => {
      expectTypeOf(row).toEqualTypeOf<Term>();
      expectTypeOf(previous).toEqualTypeOf<Term>();
    });
  });

  test("a taxonomy's scope has the shape of the handle its registration returns", () => {
    const brand = ctx.registerTermTaxonomy("brand", { label: "Brands" });

    expectTypeOf(term.for("brand")).toEqualTypeOf(brand);
    expectTypeOf(brand.created).toEqualTypeOf(term.created);
  });
});

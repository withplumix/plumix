import { describe, expectTypeOf, test } from "vitest";

import type { ViewData } from "./contract/resolved-entry.js";
import { definePlugin } from "../plugin/define.js";
import { forView } from "./render/template-builders.js";

interface CompareShare {
  readonly products: readonly string[];
}
declare module "../template-registry.js" {
  interface ViewRegistry {
    compareShare: { data: CompareShare };
  }
}

describe("views — typing", () => {
  test("forView accepts any name and types data.data from ViewRegistry", () => {
    forView("undeclared").template(({ data }) => {
      expectTypeOf(data).toEqualTypeOf<ViewData>();
      expectTypeOf(data.kind).toEqualTypeOf<"view">();
      return null;
    });
    forView("compareShare").template(({ data }) => {
      expectTypeOf(data.data).toEqualTypeOf<CompareShare>();
      expectTypeOf(data.params).toEqualTypeOf<
        Readonly<Record<string, string>>
      >();
      return null;
    });
  });

  test("registerView holds a declared view's resolver to its data", () => {
    definePlugin("typed", {
      setup: (ctx) => {
        ctx.registerView("compareShare", {
          routes: ["/c/:id"],
          // @ts-expect-error - compareShare's data is a CompareShare
          resolve: () => ({ data: { nope: 1 }, title: "x" }),
        });
        ctx.registerView("anything", {
          routes: ["/a"],
          resolve: () => ({ data: 42, title: "x" }),
        });
      },
    });
  });
});

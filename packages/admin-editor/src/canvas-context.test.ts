import { describe, expect, test } from "vitest";

import { createBlockRegistry } from "@plumix/core/blocks";

import { canvasContextValue } from "./canvas-context.js";

const props = {
  registry: createBlockRegistry([]),
  locale: "en",
  loaderData: new Map(),
  deps: {},
};

describe("canvasContextValue", () => {
  test("renders at the page's locale until the host's config arrives", () => {
    const value = canvasContextValue(props, undefined);

    expect([value.mode, value.locale, value.catalog]).toEqual([
      "edit",
      "en",
      undefined,
    ]);
  });

  test("renders at the host's locale with its pushed catalog", () => {
    const catalog = { "test.greeting": ["Hallo"] };

    const value = canvasContextValue(props, { locale: "de", catalog });

    expect([value.mode, value.locale, value.catalog]).toEqual([
      "edit",
      "de",
      catalog,
    ]);
  });
});

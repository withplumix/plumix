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

    expect(value).toMatchObject({ mode: "edit", locale: "en" });
    expect(value.catalog).toBeUndefined();
  });

  test("renders at the host's locale with its pushed catalog", () => {
    const catalog = { "test.greeting": ["Hallo"] };

    const value = canvasContextValue(props, { locale: "de", catalog });

    expect(value).toMatchObject({ mode: "edit", locale: "de", catalog });
  });
});

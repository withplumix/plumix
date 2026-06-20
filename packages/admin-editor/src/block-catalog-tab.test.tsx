import type { ReactElement } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import { createBlockRegistry } from "@plumix/blocks";

import { BlockCatalog } from "./block-catalog-tab.js";
import { EditorProvider, useEditorStore } from "./provider.js";

beforeAll(() => {
  i18n.loadAndActivate({ locale: "en", messages: {} });
});

afterEach(cleanup);

const registry = createBlockRegistry([
  {
    name: "core/heading",
    render: () => null,
    category: "text",
    title: "Heading",
  },
  { name: "core/quote", render: () => null, category: "text", title: "Quote" },
  { name: "core/image", render: () => null, category: "media", title: "Image" },
]);

const NO_CAPS: ReadonlySet<string> = new Set();

function TreeProbe(): ReactElement {
  const ids = useEditorStore((s) => s.tree.map((n) => n.name).join(","));
  return <output data-testid="tree-probe">{ids}</output>;
}

function renderCatalog(): ReturnType<typeof render> {
  return render(
    <I18nProvider i18n={i18n}>
      <EditorProvider initialTree={[]}>
        <BlockCatalog registry={registry} capabilities={NO_CAPS} />
        <TreeProbe />
      </EditorProvider>
    </I18nProvider>,
  );
}

describe("BlockCatalog", () => {
  test("lists blocks grouped by category", () => {
    const { getByTestId } = renderCatalog();
    expect(getByTestId("block-catalog-group-text")).toBeDefined();
    expect(getByTestId("block-catalog-group-media")).toBeDefined();
    expect(getByTestId("block-catalog-item-core/heading")).toBeDefined();
    expect(getByTestId("block-catalog-item-core/image")).toBeDefined();
  });

  test("search narrows the catalog", () => {
    const { getByTestId, queryByTestId } = renderCatalog();
    fireEvent.change(getByTestId("block-catalog-search"), {
      target: { value: "quote" },
    });
    expect(getByTestId("block-catalog-item-core/quote")).toBeDefined();
    expect(queryByTestId("block-catalog-item-core/heading")).toBeNull();
    expect(queryByTestId("block-catalog-group-media")).toBeNull();
  });

  test("a no-match search shows the empty state", () => {
    const { getByTestId, queryByTestId } = renderCatalog();
    fireEvent.change(getByTestId("block-catalog-search"), {
      target: { value: "zzz" },
    });
    expect(getByTestId("block-catalog-empty")).toBeDefined();
    expect(queryByTestId("block-catalog-item-core/heading")).toBeNull();
  });

  test("clicking a block appends it to the tree", () => {
    const { getByTestId } = renderCatalog();
    fireEvent.click(getByTestId("block-catalog-item-core/heading"));
    fireEvent.click(getByTestId("block-catalog-item-core/image"));
    // Appended in click order.
    expect(getByTestId("tree-probe").textContent).toBe(
      "core/heading,core/image",
    );
  });
});

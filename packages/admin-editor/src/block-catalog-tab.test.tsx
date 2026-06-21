import type { ReactElement } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import type { BlockPattern } from "@plumix/blocks";
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
  {
    name: "core/group",
    render: () => null,
    category: "layout",
    title: "Group",
    variations: [
      { slug: "group/two-col", title: "Two columns", attrs: { cols: 2 } },
    ],
  },
]);

const NO_CAPS: ReadonlySet<string> = new Set();

function TreeProbe(): ReactElement {
  const ids = useEditorStore((s) => s.tree.map((n) => n.name).join(","));
  return <output data-testid="tree-probe">{ids}</output>;
}

function renderCatalog(
  patterns?: readonly BlockPattern[],
  onInsert?: () => void,
): ReturnType<typeof render> {
  return render(
    <I18nProvider i18n={i18n}>
      <EditorProvider initialTree={[]}>
        <BlockCatalog
          registry={registry}
          capabilities={NO_CAPS}
          patterns={patterns}
          onInsert={onInsert}
        />
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

  test("fires onInsert after a click-insert (block, variation or pattern)", () => {
    const onInsert = vi.fn();
    const patterns: readonly BlockPattern[] = [
      { name: "hero", title: "Hero", content: [] },
    ];
    const { getByTestId } = renderCatalog(patterns, onInsert);
    fireEvent.click(getByTestId("block-catalog-item-core/heading"));
    fireEvent.click(getByTestId("block-catalog-item-core/group/group/two-col"));
    fireEvent.click(getByTestId("block-catalog-pattern-hero"));
    expect(onInsert).toHaveBeenCalledTimes(3);
  });

  test("lists block variations as their own items, keyed by slug", () => {
    const { getByTestId, queryByTestId } = renderCatalog();
    // A block with an inserter variation surfaces the variation in place of
    // its bare self.
    expect(
      getByTestId("block-catalog-item-core/group/group/two-col"),
    ).toBeDefined();
    expect(queryByTestId("block-catalog-item-core/group")).toBeNull();
    expect(getByTestId("block-catalog-group-layout")).toBeDefined();
  });

  test("clicking a variation appends its parent block", () => {
    const { getByTestId } = renderCatalog();
    fireEvent.click(getByTestId("block-catalog-item-core/group/group/two-col"));
    expect(getByTestId("tree-probe").textContent).toBe("core/group");
  });

  describe("patterns", () => {
    const patterns: readonly BlockPattern[] = [
      {
        name: "hero",
        title: "Hero banner",
        content: [
          { id: "p1", name: "core/heading" },
          { id: "p2", name: "core/quote" },
        ],
      },
      { name: "cta", title: "Call to action", content: [] },
    ];

    test("renders a patterns section listing each pattern", () => {
      const { getByTestId } = renderCatalog(patterns);
      expect(getByTestId("block-catalog-patterns")).toBeDefined();
      expect(getByTestId("block-catalog-pattern-hero")).toBeDefined();
      expect(getByTestId("block-catalog-pattern-cta")).toBeDefined();
    });

    test("omits the patterns section when there are none", () => {
      const { queryByTestId } = renderCatalog();
      expect(queryByTestId("block-catalog-patterns")).toBeNull();
    });

    test("clicking a pattern appends its whole composition", () => {
      const { getByTestId } = renderCatalog(patterns);
      fireEvent.click(getByTestId("block-catalog-pattern-hero"));
      expect(getByTestId("tree-probe").textContent).toBe(
        "core/heading,core/quote",
      );
    });

    test("search filters patterns alongside blocks", () => {
      const { getByTestId, queryByTestId } = renderCatalog(patterns);
      fireEvent.change(getByTestId("block-catalog-search"), {
        target: { value: "hero" },
      });
      expect(getByTestId("block-catalog-pattern-hero")).toBeDefined();
      expect(queryByTestId("block-catalog-pattern-cta")).toBeNull();
    });
  });
});

import type { ReactElement } from "react";
import { useEffect } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import type { BlockNode, BlockPattern } from "@plumix/core/blocks";
import { createBlockRegistry } from "@plumix/core/blocks";

import { BlockCatalog } from "./block-catalog-tab.js";
import { EditorConfigProvider } from "./editor-config-context.js";
import {
  EditorProvider,
  useEditorStore,
  useEditorStoreApi,
} from "./provider.js";

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
    inputs: [{ name: "content", type: "slot" }],
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
      <EditorConfigProvider
        registry={registry}
        tokens={{}}
        capabilities={NO_CAPS}
      >
        <EditorProvider registry={registry} initialTree={[]}>
          <BlockCatalog patterns={patterns} onInsert={onInsert} />
          <TreeProbe />
        </EditorProvider>
      </EditorConfigProvider>
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

  test("restricts the listed blocks to the allowed set", () => {
    const { getByTestId, queryByTestId } = render(
      <I18nProvider i18n={i18n}>
        <EditorConfigProvider
          registry={registry}
          tokens={{}}
          capabilities={NO_CAPS}
        >
          <EditorProvider registry={registry} initialTree={[]}>
            <BlockCatalog allowed={["core/heading"]} />
          </EditorProvider>
        </EditorConfigProvider>
      </I18nProvider>,
    );
    expect(getByTestId("block-catalog-item-core/heading")).toBeDefined();
    expect(queryByTestId("block-catalog-item-core/image")).toBeNull();
    expect(queryByTestId("block-catalog-item-core/quote")).toBeNull();
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

  describe("with a block selected", () => {
    const tree: readonly BlockNode[] = [
      { id: "a", name: "core/heading" },
      {
        id: "g",
        name: "core/group",
        attrs: { content: [{ id: "c", name: "core/quote" }] },
      },
      { id: "z", name: "core/quote" },
    ];

    function Selector({ id }: { readonly id: string }): null {
      const api = useEditorStoreApi();
      useEffect(() => {
        api.getState().select(id);
      }, [id, api]);
      return null;
    }

    function renderSelected(
      id: string,
      patterns?: readonly BlockPattern[],
    ): ReturnType<typeof render> {
      return render(
        <I18nProvider i18n={i18n}>
          <EditorConfigProvider
            registry={registry}
            tokens={{}}
            capabilities={NO_CAPS}
          >
            <EditorProvider registry={registry} initialTree={tree}>
              <Selector id={id} />
              <BlockCatalog patterns={patterns} />
              <TreeProbe />
            </EditorProvider>
          </EditorConfigProvider>
        </I18nProvider>,
      );
    }

    test("a click-insert lands right after the selected block", () => {
      const { getByTestId } = renderSelected("a");
      fireEvent.click(getByTestId("block-catalog-item-core/image"));
      expect(getByTestId("tree-probe").textContent).toBe(
        "core/heading,core/image,core/group,core/quote",
      );
    });

    // A nested slot may refuse the block (allowedBlocks), so an insert stays at
    // the top level, after the selection's top-level ancestor — like paste.
    test("with a nested block selected, it lands after its top-level ancestor", () => {
      const { getByTestId } = renderSelected("c");
      fireEvent.click(getByTestId("block-catalog-item-core/image"));
      expect(getByTestId("tree-probe").textContent).toBe(
        "core/heading,core/group,core/image,core/quote",
      );
    });

    test("a pattern lands right after the selected block", () => {
      const { getByTestId } = renderSelected("a", [
        {
          name: "hero",
          title: "Hero",
          content: [
            { id: "p1", name: "core/image" },
            { id: "p2", name: "core/heading" },
          ],
        },
      ]);
      fireEvent.click(getByTestId("block-catalog-pattern-hero"));
      expect(getByTestId("tree-probe").textContent).toBe(
        "core/heading,core/image,core/heading,core/group,core/quote",
      );
    });
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

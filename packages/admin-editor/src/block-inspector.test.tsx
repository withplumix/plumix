import type { ReactElement } from "react";
import { useEffect } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import type { BlockNode, BlockRegistry } from "@plumix/blocks";
import type { SerializedLoaderData } from "@plumix/blocks/renderer";
import { createBlockRegistry } from "@plumix/blocks";

import { BlockInspector } from "./block-inspector.js";
import {
  EditorProvider,
  useEditorStore,
  useEditorStoreApi,
} from "./provider.js";

beforeAll(() => {
  i18n.loadAndActivate({ locale: "en", messages: {} });
});

afterEach(cleanup);

const registry: BlockRegistry = createBlockRegistry([
  {
    name: "core/heading",
    render: () => null,
    inputs: [
      { name: "text", type: "text", label: "Text" },
      {
        name: "level",
        type: "select",
        label: "Level",
        options: [
          { label: "H2", value: 2 },
          { label: "H3", value: 3 },
        ],
      },
    ],
  },
  { name: "core/spacer", render: () => null },
  {
    name: "core/group",
    render: () => null,
    inputs: [
      { name: "content", type: "slot" },
      { name: "tag", type: "text", label: "Tag" },
    ],
  },
  {
    name: "core/latest-posts",
    render: () => null,
    loaders: { posts: () => Promise.resolve([]) },
  },
  {
    name: "core/box",
    render: () => null,
    inputs: [
      { name: "width", type: "text", label: "Width", styleProperty: "width" },
    ],
  },
  {
    name: "core/columns",
    render: () => null,
    inputs: [{ name: "columns", type: "slot", allowedBlocks: ["core/column"] }],
  },
  {
    name: "core/probe-media",
    render: () => null,
    inputs: [{ name: "image", type: "media", label: "Image" }],
  },
  {
    name: "core/column",
    render: () => null,
    requiresParent: ["core/columns"],
    inputs: [
      {
        name: "content",
        type: "slot",
        defaultChildren: [{ id: "seed", name: "core/heading" }],
      },
    ],
  },
  {
    name: "core/table",
    render: () => null,
    inputs: [
      { name: "striped", type: "checkbox", label: "Striped" },
      {
        name: "rows",
        type: "slot",
        allowedBlocks: ["core/table-header-row", "core/table-body-row"],
      },
    ],
  },
]);

function ColumnsProbe({ id }: { readonly id: string }): ReactElement {
  const count = useEditorStore((s) => {
    const node = s.tree.find((b) => b.id === id);
    return (
      (node?.attrs?.columns as readonly unknown[] | undefined)?.length ?? 0
    );
  });
  return <output data-testid="columns-count">{String(count)}</output>;
}

// "rows:cellsInFirstRow" — lets a test watch both dimensions of the table grid.
function TableProbe({ id }: { readonly id: string }): ReactElement {
  const summary = useEditorStore((s) => {
    const node = s.tree.find((b) => b.id === id);
    const rows = (node?.attrs?.rows as readonly BlockNode[] | undefined) ?? [];
    const cells =
      (rows[0]?.attrs?.cells as readonly unknown[] | undefined) ?? [];
    return `${rows.length}:${cells.length}`;
  });
  return <output data-testid="table-summary">{summary}</output>;
}

function Selector({ id }: { readonly id?: string }): ReactElement | null {
  const api = useEditorStoreApi();
  useEffect(() => {
    if (id) api.getState().select(id);
  }, [id, api]);
  return null;
}

function renderInspector(
  tree: readonly BlockNode[],
  selectId?: string,
  onRefreshBlockLoader?: (blockId: string) => Promise<SerializedLoaderData>,
): ReturnType<typeof render> {
  return render(
    <I18nProvider i18n={i18n}>
      <EditorProvider initialTree={tree}>
        <Selector id={selectId} />
        <BlockInspector
          registry={registry}
          onRefreshBlockLoader={onRefreshBlockLoader}
        />
      </EditorProvider>
    </I18nProvider>,
  );
}

describe("BlockInspector", () => {
  test("shows the empty state when nothing is selected", () => {
    const { getByTestId, queryByTestId } = renderInspector([
      { id: "h1", name: "core/heading" },
    ]);
    expect(getByTestId("block-inspector-empty")).toBeDefined();
    expect(queryByTestId("block-input-text")).toBeNull();
  });

  test("renders the active block's inputs as controls", () => {
    const { getByTestId } = renderInspector(
      [{ id: "h1", name: "core/heading", attrs: { text: "Hi", level: 2 } }],
      "h1",
    );
    expect((getByTestId("block-input-text") as HTMLInputElement).value).toBe(
      "Hi",
    );
    expect((getByTestId("block-input-level") as HTMLSelectElement).value).toBe(
      "2",
    );
  });

  test("editing an input patches the store and re-renders live", () => {
    const { getByTestId } = renderInspector(
      [{ id: "h1", name: "core/heading", attrs: { text: "Hi" } }],
      "h1",
    );
    const control = getByTestId("block-input-text") as HTMLInputElement;
    fireEvent.change(control, { target: { value: "Edited" } });
    // The inspector reads value from the store tree; a live patch round-trips
    // back into the control with no reload.
    expect((getByTestId("block-input-text") as HTMLInputElement).value).toBe(
      "Edited",
    );
  });

  test("a styleProperty input reads and writes node.style (synced with the Styles tab)", () => {
    const { getByTestId } = renderInspector(
      [{ id: "b1", name: "core/box", style: { large: { width: "800px" } } }],
      "b1",
    );
    const control = getByTestId("block-input-width") as HTMLInputElement;
    // Reads from node.style for the active device, not from attrs.
    expect(control.value).toBe("800px");
    // Editing round-trips back through node.style (the same data the Styles
    // tab's Size section edits).
    fireEvent.change(control, { target: { value: "50%" } });
    expect((getByTestId("block-input-width") as HTMLInputElement).value).toBe(
      "50%",
    );
  });

  test("skips slot inputs — editing one as a control would corrupt children", () => {
    const { getByTestId, queryByTestId } = renderInspector(
      [
        {
          id: "g1",
          name: "core/group",
          attrs: { content: [], tag: "section" },
        },
      ],
      "g1",
    );
    // The scalar input renders; the slot is omitted.
    expect(getByTestId("block-input-tag")).toBeDefined();
    expect(queryByTestId("block-input-content")).toBeNull();
  });

  test("renders the bare panel for a block with no inputs", () => {
    const { getByTestId, queryByTestId } = renderInspector(
      [{ id: "s1", name: "core/spacer" }],
      "s1",
    );
    expect(getByTestId("block-inspector")).toBeDefined();
    expect(queryByTestId("block-inspector-empty")).toBeNull();
  });

  test("shows the refresh-data control only for a loader-backed block", () => {
    const { getByTestId } = renderInspector(
      [{ id: "lp1", name: "core/latest-posts" }],
      "lp1",
      () => Promise.resolve({}),
    );
    expect(getByTestId("refresh-block-loader")).toBeDefined();
  });

  test("hides the refresh-data control for a block without loaders", () => {
    const { queryByTestId } = renderInspector(
      [{ id: "h1", name: "core/heading" }],
      "h1",
      () => Promise.resolve({}),
    );
    expect(queryByTestId("refresh-block-loader")).toBeNull();
  });

  test("hides the refresh-data control when no onRefreshBlockLoader is wired", () => {
    const { queryByTestId } = renderInspector(
      [{ id: "lp1", name: "core/latest-posts" }],
      "lp1",
    );
    expect(queryByTestId("refresh-block-loader")).toBeNull();
  });

  test("Add column inserts a core/column into the selected columns block", () => {
    const tree: readonly BlockNode[] = [
      {
        id: "cols",
        name: "core/columns",
        attrs: {
          columns: [
            { id: "a", name: "core/column" },
            { id: "b", name: "core/column" },
          ],
        },
      },
    ];
    const { getByTestId } = render(
      <I18nProvider i18n={i18n}>
        <EditorProvider initialTree={tree}>
          <Selector id="cols" />
          <BlockInspector registry={registry} />
          <ColumnsProbe id="cols" />
        </EditorProvider>
      </I18nProvider>,
    );

    expect(getByTestId("columns-count").textContent).toBe("2");
    fireEvent.click(getByTestId("inspector-add-column"));
    expect(getByTestId("columns-count").textContent).toBe("3");
  });

  test("renders a host-resolved plugin field and patches the store on edit", () => {
    const StubField = ({
      rhf,
      testId,
    }: {
      readonly rhf: {
        readonly value: unknown;
        readonly onChange: (v: unknown) => void;
      };
      readonly testId: string;
    }): ReactElement => {
      const id =
        rhf.value && typeof (rhf.value as { id?: unknown }).id === "string"
          ? (rhf.value as { id: string }).id
          : "";
      return (
        <input
          data-testid={testId}
          value={id}
          onChange={(e) => rhf.onChange({ id: e.target.value })}
        />
      );
    };
    const { getByTestId } = render(
      <I18nProvider i18n={i18n}>
        <EditorProvider
          initialTree={[
            {
              id: "m1",
              name: "core/probe-media",
              attrs: { image: { id: "7" } },
            },
          ]}
        >
          <Selector id="m1" />
          <BlockInspector
            registry={registry}
            resolvePluginFieldType={(t) =>
              t === "media" ? StubField : undefined
            }
          />
        </EditorProvider>
      </I18nProvider>,
    );
    const control = getByTestId("block-input-image") as HTMLInputElement;
    expect(control.value).toBe("7");
    // The composite value round-trips through updateBlockAttrs into attrs.image.
    fireEvent.change(control, { target: { value: "42" } });
    expect((getByTestId("block-input-image") as HTMLInputElement).value).toBe(
      "42",
    );
  });

  test("shows no Add column control for a non-columns block", () => {
    const { queryByTestId } = renderInspector(
      [{ id: "h1", name: "core/heading" }],
      "h1",
    );
    expect(queryByTestId("inspector-add-column")).toBeNull();
  });

  const tableTree: readonly BlockNode[] = [
    {
      id: "tbl",
      name: "core/table",
      attrs: {
        rows: [
          {
            id: "r0",
            name: "core/table-header-row",
            attrs: { cells: [{ id: "c0", name: "core/table-header-cell" }] },
          },
        ],
      },
    },
  ];

  function renderTableInspector(): ReturnType<typeof render> {
    return render(
      <I18nProvider i18n={i18n}>
        <EditorProvider initialTree={tableTree}>
          <Selector id="tbl" />
          <BlockInspector registry={registry} />
          <TableProbe id="tbl" />
        </EditorProvider>
      </I18nProvider>,
    );
  }

  test("Add row appends a body row to the selected table", () => {
    const { getByTestId } = renderTableInspector();
    expect(getByTestId("table-summary").textContent).toBe("1:1");
    fireEvent.click(getByTestId("inspector-add-table-row"));
    expect(getByTestId("table-summary").textContent).toBe("2:1");
  });

  test("Add column appends a cell to every row of the selected table", () => {
    const { getByTestId } = renderTableInspector();
    expect(getByTestId("table-summary").textContent).toBe("1:1");
    fireEvent.click(getByTestId("inspector-add-table-column"));
    expect(getByTestId("table-summary").textContent).toBe("1:2");
  });

  test("shows no table controls for a non-table block", () => {
    const { queryByTestId } = renderInspector(
      [{ id: "h1", name: "core/heading" }],
      "h1",
    );
    expect(queryByTestId("inspector-add-table-row")).toBeNull();
    expect(queryByTestId("inspector-add-table-column")).toBeNull();
  });
});

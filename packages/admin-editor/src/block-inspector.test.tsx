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
]);

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
});

function HtmlAttrProbe({ id }: { readonly id: string }): ReactElement {
  const attrs = useEditorStore(
    (s) => s.tree.find((n) => n.id === id)?.htmlAttrs,
  );
  return <output data-testid="html-attr-probe">{JSON.stringify(attrs)}</output>;
}

function renderHtmlAttrs(tree: readonly BlockNode[], selectId: string) {
  const utils = render(
    <I18nProvider i18n={i18n}>
      <EditorProvider initialTree={tree}>
        <Selector id={selectId} />
        <BlockInspector registry={registry} />
        <HtmlAttrProbe id={tree[0]?.id ?? ""} />
      </EditorProvider>
    </I18nProvider>,
  );
  // The HTML attributes section is collapsed by default — open it.
  fireEvent.click(utils.getByTestId("block-section-html"));
  return utils;
}

describe("BlockInspector — HTML attributes", () => {
  const withAttrs: BlockNode = {
    id: "h1",
    name: "core/heading",
    htmlAttrs: { id: "hero", "data-track": "cta" },
  };

  test("lists existing attributes as editable key/value rows", () => {
    const { getByTestId } = renderHtmlAttrs([withAttrs], "h1");
    expect((getByTestId("html-attr-id-key") as HTMLInputElement).value).toBe(
      "id",
    );
    expect((getByTestId("html-attr-id-value") as HTMLInputElement).value).toBe(
      "hero",
    );
  });

  test("the section is collapsed by default", () => {
    const { getByTestId, queryByTestId } = render(
      <I18nProvider i18n={i18n}>
        <EditorProvider initialTree={[withAttrs]}>
          <Selector id="h1" />
          <BlockInspector registry={registry} />
        </EditorProvider>
      </I18nProvider>,
    );
    expect(getByTestId("block-section-html")).toBeDefined();
    expect(queryByTestId("html-attr-id-key")).toBeNull();
  });

  test("editing a value writes it back to the block", () => {
    const { getByTestId } = renderHtmlAttrs([withAttrs], "h1");
    fireEvent.change(getByTestId("html-attr-id-value"), {
      target: { value: "main" },
    });
    expect(getByTestId("html-attr-probe").textContent).toContain('"id":"main"');
  });

  test("removing an attribute clears it", () => {
    const single: BlockNode = {
      id: "h1",
      name: "core/heading",
      htmlAttrs: { id: "hero" },
    };
    const { getByTestId } = renderHtmlAttrs([single], "h1");
    fireEvent.click(getByTestId("html-attr-id-remove"));
    expect(getByTestId("html-attr-probe").textContent).toBe("");
  });

  test("adds an attribute via the combobox and value", () => {
    const { getByTestId } = renderHtmlAttrs(
      [{ id: "h1", name: "core/heading" }],
      "h1",
    );
    fireEvent.click(getByTestId("html-attr-add-key"));
    fireEvent.click(getByTestId("html-attr-add-key-option-role"));
    fireEvent.change(getByTestId("html-attr-add-value"), {
      target: { value: "banner" },
    });
    fireEvent.click(getByTestId("html-attr-add-submit"));
    expect(getByTestId("html-attr-probe").textContent).toContain(
      '"role":"banner"',
    );
  });

  test("offers no create item for a disallowed attribute name", () => {
    const { getByTestId, queryByTestId } = renderHtmlAttrs(
      [{ id: "h1", name: "core/heading" }],
      "h1",
    );
    fireEvent.click(getByTestId("html-attr-add-key"));
    fireEvent.change(getByTestId("html-attr-add-key-search"), {
      target: { value: "onclick" },
    });
    expect(queryByTestId("html-attr-add-key-create")).toBeNull();
  });

  test("normalizes a typed key to lowercase so the renderer keeps it", () => {
    const { getByTestId } = renderHtmlAttrs(
      [{ id: "h1", name: "core/heading" }],
      "h1",
    );
    fireEvent.click(getByTestId("html-attr-add-key"));
    fireEvent.change(getByTestId("html-attr-add-key-search"), {
      target: { value: "Data-Track" },
    });
    fireEvent.click(getByTestId("html-attr-add-key-create"));
    fireEvent.change(getByTestId("html-attr-add-value"), {
      target: { value: "cta" },
    });
    fireEvent.click(getByTestId("html-attr-add-submit"));
    expect(getByTestId("html-attr-probe").textContent).toContain(
      '"data-track":"cta"',
    );
  });

  test("won't add a case-variant of an existing attribute", () => {
    const { getByTestId, queryByTestId } = renderHtmlAttrs([withAttrs], "h1");
    fireEvent.click(getByTestId("html-attr-add-key"));
    fireEvent.change(getByTestId("html-attr-add-key-search"), {
      target: { value: "DATA-TRACK" },
    });
    // `data-track` already exists, so no create item for its uppercase variant.
    expect(queryByTestId("html-attr-add-key-create")).toBeNull();
  });

  test("renames an attribute via the key field on commit", () => {
    const { getByTestId } = renderHtmlAttrs([withAttrs], "h1");
    const key = getByTestId("html-attr-id-key") as HTMLInputElement;
    fireEvent.change(key, { target: { value: "title" } });
    fireEvent.blur(key);
    expect(getByTestId("html-attr-probe").textContent).toContain(
      '"title":"hero"',
    );
    expect(getByTestId("html-attr-probe").textContent).not.toContain('"id"');
  });
});

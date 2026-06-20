import type { ReactElement } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import type { BlockNode } from "@plumix/blocks";
import { createBlockRegistry } from "@plumix/blocks";

import { LayersTab } from "./layers-tab.js";
import { EditorProvider, useEditorStore } from "./provider.js";

beforeAll(() => {
  i18n.loadAndActivate({ locale: "en", messages: {} });
});

afterEach(cleanup);

const registry = createBlockRegistry([
  { name: "core/heading", render: () => null, title: "Heading" },
  { name: "core/group", render: () => null, title: "Group" },
]);

const TREE: readonly BlockNode[] = [
  { id: "a", name: "core/heading" },
  {
    id: "g",
    name: "core/group",
    attrs: { content: [{ id: "c", name: "core/heading" }] },
  },
];

function ActiveProbe(): ReactElement {
  const activeId = useEditorStore((s) => s.activeId);
  return <output data-testid="active-probe">{activeId ?? ""}</output>;
}

function renderLayers(tree: readonly BlockNode[]): ReturnType<typeof render> {
  return render(
    <I18nProvider i18n={i18n}>
      <EditorProvider initialTree={tree}>
        <LayersTab registry={registry} />
        <ActiveProbe />
      </EditorProvider>
    </I18nProvider>,
  );
}

describe("LayersTab", () => {
  test("renders the nested structure as indented rows", () => {
    const { getByTestId } = renderLayers(TREE);
    expect(getByTestId("layer-a")).toBeDefined();
    expect(getByTestId("layer-g")).toBeDefined();
    // The nested child is rendered and indented one level.
    const child = getByTestId("layer-c").parentElement;
    expect(child?.style.paddingInlineStart).toBe("16px");
  });

  test("uses the registry title as the layer label", () => {
    const { getByTestId } = renderLayers(TREE);
    expect(getByTestId("layer-g").textContent).toBe("Group");
  });

  test("clicking a layer selects the block", () => {
    const { getByTestId } = renderLayers(TREE);
    expect(getByTestId("active-probe").textContent).toBe("");
    fireEvent.click(getByTestId("layer-c"));
    expect(getByTestId("active-probe").textContent).toBe("c");
  });

  test("shows an empty state when there are no blocks", () => {
    const { getByTestId } = renderLayers([]);
    expect(getByTestId("layers-empty")).toBeDefined();
  });
});

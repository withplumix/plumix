import type { ReactElement } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import { createBlockRegistry } from "@plumix/blocks";

import { BlockInserterPopover } from "./block-inserter.js";
import { EditorProvider, useEditorStore } from "./provider.js";

beforeAll(() => {
  i18n.loadAndActivate({ locale: "en", messages: {} });
});

afterEach(cleanup);

const registry = createBlockRegistry([
  { name: "core/heading", render: () => null, category: "text", title: "H" },
]);

const NO_CAPS: ReadonlySet<string> = new Set();

function TreeProbe(): ReactElement {
  const names = useEditorStore((s) => s.tree.map((n) => n.name).join(","));
  return <output data-testid="tree-probe">{names}</output>;
}

function renderInserter(): ReturnType<typeof render> {
  return render(
    <I18nProvider i18n={i18n}>
      <EditorProvider initialTree={[]}>
        <BlockInserterPopover registry={registry} capabilities={NO_CAPS} />
        <TreeProbe />
      </EditorProvider>
    </I18nProvider>,
  );
}

describe("BlockInserterPopover", () => {
  test("opens the catalog from the + Add Block trigger", () => {
    const { getByTestId, queryByTestId } = renderInserter();
    expect(queryByTestId("block-catalog")).toBeNull();
    fireEvent.click(getByTestId("plumix-add-block"));
    expect(getByTestId("block-catalog")).toBeDefined();
  });

  test("inserting a block appends it and closes the popover", () => {
    const { getByTestId, queryByTestId } = renderInserter();
    fireEvent.click(getByTestId("plumix-add-block"));
    fireEvent.click(getByTestId("block-catalog-item-core/heading"));
    expect(getByTestId("tree-probe").textContent).toBe("core/heading");
    expect(queryByTestId("block-catalog")).toBeNull();
  });
});

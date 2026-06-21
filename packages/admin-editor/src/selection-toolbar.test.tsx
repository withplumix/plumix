import { useEffect } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import type { BlockNode } from "@plumix/blocks";

import { EditorProvider, useEditorStoreApi } from "./provider.js";
import { SelectionToolbar } from "./selection-toolbar.js";

const BOX = { left: 10, top: 20, width: 100, height: 40 };

beforeAll(() => {
  i18n.loadAndActivate({ locale: "en", messages: {} });
});

afterEach(cleanup);

let storeApi: ReturnType<typeof useEditorStoreApi> | undefined;
function Capture(): null {
  const api = useEditorStoreApi();
  useEffect(() => {
    storeApi = api;
  }, [api]);
  return null;
}

function renderToolbar(tree: readonly BlockNode[]): ReturnType<typeof render> {
  return render(
    <I18nProvider i18n={i18n}>
      <EditorProvider initialTree={tree}>
        <SelectionToolbar box={BOX} />
        <Capture />
      </EditorProvider>
    </I18nProvider>,
  );
}

const button = (el: HTMLElement): HTMLButtonElement => el as HTMLButtonElement;

describe("SelectionToolbar", () => {
  test("renders nothing until a block is active", () => {
    const { queryByTestId } = renderToolbar([{ id: "a", name: "core/x" }]);
    expect(queryByTestId("plumix-selection-toolbar")).toBeNull();
  });

  test("deletes every selected block", () => {
    const { getByTestId } = renderToolbar([
      { id: "a", name: "core/x" },
      { id: "b", name: "core/x" },
      { id: "c", name: "core/x" },
    ]);
    act(() => {
      storeApi?.getState().select("a");
      storeApi?.getState().select("c", { additive: true });
    });

    fireEvent.click(getByTestId("selection-toolbar-delete"));

    expect(storeApi?.getState().tree.map((n) => n.id)).toEqual(["b"]);
  });

  test("duplicates the active block", () => {
    const { getByTestId } = renderToolbar([{ id: "a", name: "core/x" }]);
    act(() => storeApi?.getState().select("a"));

    fireEvent.click(getByTestId("selection-toolbar-duplicate"));

    expect(storeApi?.getState().tree).toHaveLength(2);
  });

  test("moves the active block up and down", () => {
    const { getByTestId } = renderToolbar([
      { id: "a", name: "core/x" },
      { id: "b", name: "core/x" },
    ]);
    act(() => storeApi?.getState().select("a"));

    fireEvent.click(getByTestId("selection-toolbar-move-down"));
    expect(storeApi?.getState().tree.map((n) => n.id)).toEqual(["b", "a"]);

    fireEvent.click(getByTestId("selection-toolbar-move-up"));
    expect(storeApi?.getState().tree.map((n) => n.id)).toEqual(["a", "b"]);
  });

  test("selects the container, disabled for a top-level block", () => {
    const { getByTestId } = renderToolbar([
      {
        id: "g",
        name: "core/group",
        attrs: { content: [{ id: "child", name: "core/x" }] },
      },
    ]);

    // Top-level block: select-parent is disabled.
    act(() => storeApi?.getState().select("g"));
    expect(
      button(getByTestId("selection-toolbar-select-parent")).disabled,
    ).toBe(true);

    // Nested block: select-parent walks up to the group.
    act(() => storeApi?.getState().select("child"));
    fireEvent.click(getByTestId("selection-toolbar-select-parent"));
    expect(storeApi?.getState().activeId).toBe("g");
  });

  test("shows a count when several blocks are selected", () => {
    const { getByTestId, queryByTestId } = renderToolbar([
      { id: "a", name: "core/x" },
      { id: "b", name: "core/x" },
    ]);

    act(() => storeApi?.getState().select("a"));
    expect(queryByTestId("selection-toolbar-count")).toBeNull();

    act(() => storeApi?.getState().select("b", { additive: true }));
    expect(getByTestId("selection-toolbar-count").textContent).toContain("2");
  });

  test("disables single-target actions while several blocks are selected", () => {
    const { getByTestId } = renderToolbar([
      {
        id: "g",
        name: "core/group",
        attrs: {
          content: [
            { id: "a", name: "core/x" },
            { id: "b", name: "core/x" },
          ],
        },
      },
    ]);
    act(() => {
      storeApi?.getState().select("a");
      storeApi?.getState().select("b", { additive: true });
    });

    // Move + select-parent are ambiguous across a multi-selection → disabled;
    // bulk delete/duplicate stay enabled.
    expect(button(getByTestId("selection-toolbar-move-up")).disabled).toBe(
      true,
    );
    expect(button(getByTestId("selection-toolbar-move-down")).disabled).toBe(
      true,
    );
    expect(
      button(getByTestId("selection-toolbar-select-parent")).disabled,
    ).toBe(true);
    expect(button(getByTestId("selection-toolbar-delete")).disabled).toBe(
      false,
    );
    expect(button(getByTestId("selection-toolbar-duplicate")).disabled).toBe(
      false,
    );
  });
});

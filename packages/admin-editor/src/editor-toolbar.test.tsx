import { useEffect } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import { EditorShortcuts, EditorToolbar } from "./editor-toolbar.js";
import { EditorProvider, useEditorStoreApi } from "./provider.js";

beforeAll(() => {
  i18n.loadAndActivate({ locale: "en", messages: {} });
});

afterEach(cleanup);

// Exposes the store so a test can drive edits the toolbar reacts to.
let storeApi: ReturnType<typeof useEditorStoreApi> | undefined;
function Capture(): null {
  const api = useEditorStoreApi();
  useEffect(() => {
    storeApi = api;
  }, [api]);
  return null;
}

function renderToolbar(): ReturnType<typeof render> {
  return render(
    <I18nProvider i18n={i18n}>
      <EditorProvider initialTree={[]}>
        <EditorToolbar />
        <EditorShortcuts />
        <Capture />
      </EditorProvider>
    </I18nProvider>,
  );
}

describe("EditorToolbar", () => {
  const button = (el: HTMLElement): HTMLButtonElement =>
    el as HTMLButtonElement;

  test("undo/redo start disabled", () => {
    const { getByTestId } = renderToolbar();
    expect(button(getByTestId("plumix-undo")).disabled).toBe(true);
    expect(button(getByTestId("plumix-redo")).disabled).toBe(true);
  });

  test("undo enables after an edit and reverts it on click", () => {
    const { getByTestId } = renderToolbar();
    act(() => storeApi?.getState().insertBlock({ id: "a", name: "core/x" }, 0));

    const undoButton = getByTestId("plumix-undo");
    expect(button(undoButton).disabled).toBe(false);
    fireEvent.click(undoButton);

    expect(storeApi?.getState().tree).toHaveLength(0);
    expect(button(getByTestId("plumix-redo")).disabled).toBe(false);
  });

  test("Ctrl/Cmd+Z undoes via the keyboard", () => {
    renderToolbar();
    storeApi?.getState().insertBlock({ id: "a", name: "core/x" }, 0);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(storeApi?.getState().tree).toHaveLength(0);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(storeApi?.getState().tree).toHaveLength(1);
  });

  test("does not hijack undo while typing in a field", () => {
    renderToolbar();
    storeApi?.getState().insertBlock({ id: "a", name: "core/x" }, 0);

    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "z", ctrlKey: true });
    // The edit survives — the shortcut deferred to the field's native undo.
    expect(storeApi?.getState().tree).toHaveLength(1);
    input.remove();
  });
});

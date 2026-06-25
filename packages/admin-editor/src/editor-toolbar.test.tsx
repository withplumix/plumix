import { useEffect } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import { SidebarProvider } from "@plumix/admin-ui/sidebar";

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
        <SidebarProvider>
          <EditorToolbar />
        </SidebarProvider>
        <EditorShortcuts />
        <Capture />
      </EditorProvider>
    </I18nProvider>,
  );
}

describe("EditorToolbar", () => {
  test("device switch + zoom controls drive the store", () => {
    const { getByTestId } = renderToolbar();

    // Device switch.
    fireEvent.click(getByTestId("plumix-device-tablet"));
    expect(storeApi?.getState().device).toBe("tablet");

    // Zoom in steps up and turns off fit; the percent reflects it.
    fireEvent.click(getByTestId("plumix-zoom-in"));
    expect(storeApi?.getState().zoomFit).toBe(false);
    expect(Number(storeApi?.getState().zoom)).toBeGreaterThan(1);
    expect(getByTestId("plumix-zoom-percent").textContent).toContain("%");

    // The percent readout re-enables fit-to-width.
    fireEvent.click(getByTestId("plumix-zoom-percent"));
    expect(storeApi?.getState().zoomFit).toBe(true);
  });

  test("the X-ray toggle flips the store and reflects its pressed state", () => {
    const { getByTestId } = renderToolbar();
    const toggle = getByTestId("plumix-xray-toggle");

    expect(storeApi?.getState().xray).toBe(false);
    expect(toggle.getAttribute("data-state")).toBe("off");

    fireEvent.click(toggle);
    expect(storeApi?.getState().xray).toBe(true);
    expect(getByTestId("plumix-xray-toggle").getAttribute("data-state")).toBe(
      "on",
    );
  });
});

describe("EditorShortcuts", () => {
  test("Ctrl/Cmd+Z undoes via the keyboard, +Shift redoes", () => {
    renderToolbar();
    act(() => storeApi?.getState().insertBlock({ id: "a", name: "core/x" }, 0));

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(storeApi?.getState().tree).toHaveLength(0);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(storeApi?.getState().tree).toHaveLength(1);
  });

  test("does not hijack undo while typing in a field", () => {
    renderToolbar();
    act(() => storeApi?.getState().insertBlock({ id: "a", name: "core/x" }, 0));

    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "z", ctrlKey: true });
    // The edit survives — the shortcut deferred to the field's native undo.
    expect(storeApi?.getState().tree).toHaveLength(1);
    input.remove();
  });
});

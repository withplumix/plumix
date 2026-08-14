import { useEffect } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import type { BlockNode } from "@plumix/blocks";
import { SidebarProvider } from "@plumix/admin-ui/sidebar";

import { EditorHeader } from "./editor-header.js";
import { EditorShortcuts, EditorToolbar } from "./editor-toolbar.js";
import {
  EditorProvider,
  useCameraStoreApi,
  useEditorStoreApi,
} from "./provider.js";

beforeAll(() => {
  i18n.loadAndActivate({ locale: "en", messages: {} });
});

afterEach(cleanup);

// Exposes the stores so a test can drive edits the toolbar reacts to (document
// store) and read the camera (pan/zoom/fit).
let storeApi: ReturnType<typeof useEditorStoreApi> | undefined;
let cameraApi: ReturnType<typeof useCameraStoreApi> | undefined;
function Capture(): null {
  const api = useEditorStoreApi();
  const camera = useCameraStoreApi();
  useEffect(() => {
    storeApi = api;
    cameraApi = camera;
  }, [api, camera]);
  return null;
}

function renderToolbar(options?: {
  readonly hasStarters?: boolean;
  readonly tree?: readonly BlockNode[];
}): ReturnType<typeof render> {
  return render(
    <I18nProvider i18n={i18n}>
      <EditorProvider initialTree={options?.tree ?? []}>
        <SidebarProvider>
          <EditorToolbar hasStarters={options?.hasStarters} />
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
    expect(cameraApi?.getState().fit).toBe(false);
    expect(Number(cameraApi?.getState().zoom)).toBeGreaterThan(1);
    expect(getByTestId("plumix-zoom-percent").textContent).toContain("%");

    // The percent readout re-enables fit-to-width.
    fireEvent.click(getByTestId("plumix-zoom-percent"));
    expect(cameraApi?.getState().fit).toBe(true);
  });

  test("switching device re-enters fit after a manual zoom", () => {
    const { getByTestId } = renderToolbar();

    // A manual zoom leaves fit mode.
    fireEvent.click(getByTestId("plumix-zoom-in"));
    expect(cameraApi?.getState().fit).toBe(false);

    // A device switch re-fits so the new frame width fills the viewport — the
    // one document→camera coupling, wired as a provider subscription.
    fireEvent.click(getByTestId("plumix-device-mobile"));
    expect(cameraApi?.getState().fit).toBe(true);
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

  test("hides the pick-a-starter re-open when there are no starters", () => {
    const { queryByTestId } = renderToolbar({ hasStarters: false });
    expect(queryByTestId("plumix-editor-replace-starter")).toBeNull();
  });

  test("hides the pick-a-starter re-open once the canvas has blocks", () => {
    const { queryByTestId } = renderToolbar({
      hasStarters: true,
      tree: [{ id: "h1", name: "core/heading", attrs: { text: "Hi" } }],
    });
    expect(queryByTestId("plumix-editor-replace-starter")).toBeNull();
  });

  test("re-opens the starter picker from the toolbar while the canvas is empty", () => {
    const { getByTestId } = renderToolbar({ hasStarters: true });

    expect(storeApi?.getState().starterOpen).toBe(false);
    fireEvent.click(getByTestId("plumix-editor-replace-starter"));
    expect(storeApi?.getState().starterOpen).toBe(true);
  });
});

describe("header / toolbar alignment", () => {
  // Picks the first class with the given prefix, e.g. "px-" -> "px-3". Tailwind
  // tokens, not pixels — jsdom does no layout, so we pin the shared contract.
  const token = (el: HTMLElement, prefix: string): string | undefined =>
    el.className.split(" ").find((c) => c.startsWith(prefix));

  test("both chrome bars share the same horizontal inset and toggle size", () => {
    const { getByTestId } = render(
      <I18nProvider i18n={i18n}>
        <EditorProvider initialTree={[]}>
          <EditorHeader onBack={() => undefined} />
          <SidebarProvider>
            <EditorToolbar />
          </SidebarProvider>
        </EditorProvider>
      </I18nProvider>,
    );

    const header = getByTestId("plumix-editor-header");
    const toolbar = getByTestId("plumix-editor-toolbar");
    // Same left/right inset → the back button and rails toggle line up.
    expect(token(toolbar, "px-")).toBe(token(header, "px-"));

    // Same button box → their icon centers align, not just their left edges.
    // The back button emits its size via the `icon-sm` Button variant while the
    // toolbar hardcodes `size-8`; this pins those to the same token, so a retune
    // of `icon-sm` to a different class trips it even if the bars still align.
    expect(token(getByTestId("plumix-rails-toggle"), "size-")).toBe(
      token(getByTestId("plumix-editor-back"), "size-"),
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

import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { SidebarProvider, useSidebar } from "@plumix/admin-ui/sidebar";

import type { View } from "./canvas-view.js";
import type { CanvasKeys } from "./use-canvas-keys.js";
import { treeBlocks } from "../test/tree-blocks.js";
import { EditorProvider, useEditorStoreApi } from "./provider.js";
import { useCanvasKeys } from "./use-canvas-keys.js";

afterEach(cleanup);

const noop = (): void => undefined;

let storeApi: ReturnType<typeof useEditorStoreApi> | undefined;
let keys: CanvasKeys | undefined;
let sidebarState: string | undefined;

function Harness(): null {
  const liveViewRef: RefObject<View> = useRef<View>({
    panX: 0,
    panY: 0,
    zoom: 1,
  });
  const api = useEditorStoreApi();
  const canvasKeys = useCanvasKeys({
    panByClientDelta: noop,
    commitLive: noop,
    zoomToSelection: noop,
    liveViewRef,
  });
  const { state } = useSidebar();
  useEffect(() => {
    storeApi = api;
    keys = canvasKeys;
    sidebarState = state;
  }, [api, canvasKeys, state]);
  return null;
}

function renderKeys(): void {
  render(
    <SidebarProvider>
      <EditorProvider
        registry={treeBlocks}
        initialTree={[
          { id: "a", name: "core/x" },
          { id: "b", name: "core/x" },
        ]}
      >
        <Harness />
      </EditorProvider>
    </SidebarProvider>,
  );
}

// A key the canvas forwards over the bridge: the iframe holds focus, so this
// is the only way the press reaches the host.
function forward(code: string, shiftKey = false): void {
  act(() => {
    keys?.keyHandlerRef.current?.(true, code, shiftKey);
    keys?.keyHandlerRef.current?.(false, code, shiftKey);
  });
}

const ids = (): string[] =>
  storeApi?.getState().tree.map((node) => node.id) ?? [];

describe("useCanvasKeys — keys forwarded from the canvas", () => {
  test("Cmd+Z undoes and Cmd+Shift+Z redoes", () => {
    renderKeys();
    act(() => {
      storeApi?.getState().select("a");
      storeApi?.getState().moveSelectedBy(1);
    });
    expect(ids()).toEqual(["b", "a"]);

    forward("KeyZ");
    expect(ids()).toEqual(["a", "b"]);

    forward("KeyZ", true);
    expect(ids()).toEqual(["b", "a"]);
  });

  test.each(["Delete", "Backspace"])(
    "%s removes the selected block",
    (code) => {
      renderKeys();
      act(() => storeApi?.getState().select("a"));

      forward(code);

      expect(ids()).toEqual(["b"]);
    },
  );

  test("Cmd+B shows and hides the panels", () => {
    renderKeys();
    expect(sidebarState).toBe("expanded");

    forward("KeyB");

    expect(sidebarState).toBe("collapsed");
  });
});

describe("useCanvasKeys — keys pressed in the host", () => {
  // The host's own undo listener (EditorShortcuts) and the sidebar already
  // answer these there; answering again here would act twice.
  test("does not undo on a host Cmd+Z", () => {
    renderKeys();
    act(() => {
      storeApi?.getState().select("a");
      storeApi?.getState().moveSelectedBy(1);
    });

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "z", code: "KeyZ", metaKey: true }),
      );
    });

    expect(ids()).toEqual(["b", "a"]);
  });
});

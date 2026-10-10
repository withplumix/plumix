import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";

import type { View } from "./canvas-view.js";
import type { EditorShortcutId } from "./shortcuts.js";
import { useCameraStoreApi, useEditorStoreApi } from "./provider.js";
import {
  forwardedShortcut,
  forwardedShortcutId,
  isTypingTarget,
} from "./shortcuts.js";

const HOST_HANDLED: ReadonlySet<EditorShortcutId> = new Set([
  "help.open",
  "palette.open",
  "history.undo",
  "history.redo",
  "panels.toggle",
  "selection.delete",
]);

type CanvasKeyHandler = (
  down: boolean,
  code: string,
  shiftKey: boolean,
) => void;

export interface CanvasKeys {
  /** Space held → ready to pan-drag (grab cursor; the iframe goes click-through
   *  so the host receives the drag). */
  readonly panReady: boolean;
  /** Latest key handler, so the bridge's forwarded keys (iframe focus) and the
   *  window listener (shell focus) both reach the same logic without
   *  re-subscribing the bridge. */
  readonly keyHandlerRef: RefObject<CanvasKeyHandler | null>;
}

/**
 * Keys arrive natively and forwarded from the iframe; `keyHandlerRef` is the
 * one handler the bridge calls.
 */
export function useCanvasKeys({
  panByClientDelta,
  commitLive,
  zoomToSelection,
  liveViewRef,
}: {
  readonly panByClientDelta: (
    dx: number,
    dy: number,
    startPanX: number,
    startPanY: number,
  ) => void;
  readonly commitLive: () => void;
  readonly zoomToSelection: () => void;
  readonly liveViewRef: RefObject<View>;
}): CanvasKeys {
  const store = useEditorStoreApi();
  const camera = useCameraStoreApi();
  const [panReady, setPanReady] = useState(false);
  const keyHandlerRef = useRef<CanvasKeyHandler | null>(null);

  useEffect(() => {
    let spaceHeld = false;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startPanX = 0;
    let startPanY = 0;
    // The render owns the iframe's click-through; toggling pointerEvents here
    // would desync.
    const exitPan = (): void => {
      spaceHeld = false;
      dragging = false;
      setPanReady(false);
    };
    const run = (id: EditorShortcutId | null, down: boolean): void => {
      if (id !== "canvas.pan") {
        if (!down) return;
        if (id === "canvas.fit") camera.getState().enableFit();
        else if (id === "canvas.frameSelection") zoomToSelection();
        else if (id === "canvas.actualSize") camera.getState().zoomToCenter(1);
        else if (id === "canvas.xray") store.getState().toggleXray();
        else if (id === "help.open") store.getState().setShortcutsOpen(true);
        else if (id === "palette.open") store.getState().setPaletteOpen(true);
        else if (id === "history.undo") store.getState().undo();
        else if (id === "history.redo") store.getState().redo();
        else if (id === "selection.delete") store.getState().removeSelected();
        // The vendored sidebar owns Cmd+B through its own window listener, so
        // a press forwarded from the canvas is replayed where it listens.
        else if (id === "panels.toggle") {
          window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "b", metaKey: true }),
          );
        }
        return;
      }
      if (!down) exitPan();
      else if (!spaceHeld) {
        spaceHeld = true;
        setPanReady(true);
      }
    };
    // The bridge speaks codes, so this end is the one place that decodes one.
    const handleKey: CanvasKeyHandler = (down, code, shiftKey): void => {
      run(forwardedShortcutId(code, shiftKey), down);
    };
    keyHandlerRef.current = handleKey;

    const onKeyDown = (e: KeyboardEvent): void => {
      // Skip auto-repeat: a held key must not re-fire the x-ray toggle.
      if (e.repeat || isTypingTarget(e.target)) return;
      const claimed = forwardedShortcut(e);
      // These have their own host listeners, so here they only arrive
      // forwarded.
      if (!claimed || HOST_HANDLED.has(claimed.id)) return;
      if (claimed.id === "canvas.pan") e.preventDefault();
      run(claimed.id, true);
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      // Only the held binding has a release worth acting on.
      run(forwardedShortcutId(e.code, e.shiftKey), false);
    };
    const onPointerDown = (e: PointerEvent): void => {
      if (!spaceHeld) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startPanX = liveViewRef.current.panX;
      startPanY = liveViewRef.current.panY;
    };
    const onPointerMove = (e: PointerEvent): void => {
      if (!dragging) return;
      // Live (imperative) — no per-frame render.
      panByClientDelta(
        e.clientX - startX,
        e.clientY - startY,
        startPanX,
        startPanY,
      );
    };
    const onPointerUp = (): void => {
      if (dragging) commitLive();
      dragging = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      keyHandlerRef.current = null;
      exitPan();
    };
  }, [
    store,
    camera,
    zoomToSelection,
    panByClientDelta,
    commitLive,
    liveViewRef,
  ]);

  return { panReady, keyHandlerRef };
}

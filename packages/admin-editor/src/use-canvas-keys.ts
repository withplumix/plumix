import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";

import type { View } from "./canvas-view.js";
import { useEditorStoreApi } from "./provider.js";

export type CanvasKeyHandler = (
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

/** The keys this canvas claims: Space (pan) and Shift+0/1/2/X (view shortcuts).
 *  Everything else falls through to the page. */
export function isViewShortcut(code: string, shiftKey: boolean): boolean {
  if (code === "Space") return true;
  return (
    shiftKey &&
    (code === "Digit0" ||
      code === "Digit1" ||
      code === "Digit2" ||
      code === "KeyX")
  );
}

function isTyping(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLElement &&
    (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
  );
}

/**
 * Space-to-pan + view shortcuts (fit / frame-selection / reset / x-ray). Keys
 * arrive natively (shell focus) and forwarded from the iframe (canvas focus) —
 * both routed through one handler exposed via `keyHandlerRef` for the bridge.
 * The pan drag reads pan/zoom's live view and commits through its handlers.
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
  const [panReady, setPanReady] = useState(false);
  const keyHandlerRef = useRef<CanvasKeyHandler | null>(null);

  useEffect(() => {
    let spaceHeld = false;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startPanX = 0;
    let startPanY = 0;
    // The iframe's click-through is owned declaratively by the render (none
    // while a block drag OR a space-pan is active), so this just tracks the
    // space state — no imperative pointerEvents toggling to desync.
    const exitPan = (): void => {
      spaceHeld = false;
      dragging = false;
      setPanReady(false);
    };
    const handleKey: CanvasKeyHandler = (down, code, shiftKey): void => {
      if (!down) {
        if (code === "Space") exitPan();
        return;
      }
      if (code === "Space") {
        if (!spaceHeld) {
          spaceHeld = true;
          setPanReady(true);
        }
        return;
      }
      if (!shiftKey) return;
      if (code === "Digit1") store.getState().enableZoomFit();
      else if (code === "Digit2") zoomToSelection();
      else if (code === "Digit0") store.getState().zoomToCenter(1);
      else if (code === "KeyX") store.getState().toggleXray();
    };
    keyHandlerRef.current = handleKey;

    const onKeyDown = (e: KeyboardEvent): void => {
      // Skip auto-repeat: a held key must not re-fire the x-ray toggle.
      if (
        e.repeat ||
        isTyping(e.target) ||
        !isViewShortcut(e.code, e.shiftKey)
      ) {
        return;
      }
      if (e.code === "Space") e.preventDefault();
      handleKey(true, e.code, e.shiftKey);
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.code === "Space") handleKey(false, e.code, false);
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
  }, [store, zoomToSelection, panByClientDelta, commitLive, liveViewRef]);

  return { panReady, keyHandlerRef };
}

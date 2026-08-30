import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { Geometry } from "./canvas-geometry.js";
import type { View } from "./canvas-view.js";
import {
  centerOnRect,
  clampPanToFrame,
  frameSelection,
  wheelToView,
} from "./canvas-view.js";
import {
  useCameraStore,
  useCameraStoreApi,
  useEditorStoreApi,
} from "./provider.js";

export interface PanZoom {
  /** Attach to the pannable stage node the transform is written to. */
  readonly stageRef: RefObject<HTMLDivElement | null>;
  /** True during a live pan/zoom gesture — overlays hide, the ref drives paint. */
  readonly gesturing: boolean;
  /** Live view during a gesture; seeds the next gesture's pan start. */
  readonly liveViewRef: RefObject<View>;
  /** Pan by a client-pixel delta from a drag start, clamped to the frame. */
  readonly panByClientDelta: (
    dx: number,
    dy: number,
    startPanX: number,
    startPanY: number,
  ) => void;
  /** Commit the live gesture view to the store and end the gesture. */
  readonly commitLive: () => void;
  /** Pointer-down on the canvas handle strip → pan-drag with pointer capture. */
  readonly onHandlePointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  /** Free-canvas wheel (host margin + iframe-forwarded): pan, or zoom-to-cursor. */
  readonly handleWheel: (
    deltaX: number,
    deltaY: number,
    zoomIntent: boolean,
    cx: number,
    cy: number,
  ) => void;
  /** Frame the active block in the viewport (Shift+2). */
  readonly zoomToSelection: () => void;
  /** Pan the active block into the middle of the viewport, keeping the zoom. */
  readonly centerSelection: () => void;
}

/**
 * The Figma-style pannable/zoomable stage. During a continuous gesture the
 * transform is written straight to the stage DOM node and the live view kept in
 * a ref (zero renders per frame); the store is committed once when the gesture
 * settles. Reads container geometry (via `geometryRef`) to clamp the frame on
 * screen. Geometry itself is owned by the caller — this hook never writes it.
 */
export function usePanZoom({
  iframeRef,
  containerRef,
  geometryRef,
}: {
  readonly iframeRef: RefObject<HTMLIFrameElement | null>;
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly geometryRef: RefObject<Geometry>;
}): PanZoom {
  const editor = useEditorStoreApi();
  const camera = useCameraStoreApi();
  const zoom = useCameraStore((s) => s.zoom);
  const panX = useCameraStore((s) => s.panX);
  const panY = useCameraStore((s) => s.panY);

  const stageRef = useRef<HTMLDivElement>(null);
  const liveViewRef = useRef<View>({ zoom, panX, panY });
  const gesturingRef = useRef(false);
  const [gesturing, setGesturing] = useState(false);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Commit the live gesture view to the store (one render) and end the gesture.
  const commitLive = useCallback((): void => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    if (!gesturingRef.current) return;
    gesturingRef.current = false;
    setGesturing(false);
    camera.getState().applyView(liveViewRef.current);
  }, [camera]);

  // Apply a view live: write the transform straight to the DOM (no render),
  // track it in the ref, and debounce a single commit when the gesture idles.
  const applyLive = useCallback(
    (view: View): void => {
      liveViewRef.current = view;
      const el = stageRef.current;
      if (el) {
        el.style.transform = `translate(${String(view.panX)}px, ${String(view.panY)}px) scale(${String(view.zoom)})`;
      }
      if (!gesturingRef.current) {
        gesturingRef.current = true;
        setGesturing(true);
      }
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      commitTimerRef.current = setTimeout(commitLive, 150);
    },
    [commitLive],
  );

  // Pan the stage by a client-pixel delta from a drag start, clamped to the
  // frame. Shared by the space-drag handler and the canvas handle strip.
  const panByClientDelta = useCallback(
    (dx: number, dy: number, startPanX: number, startPanY: number): void => {
      const box = geometryRef.current.container;
      const iframe = iframeRef.current;
      if (!box || !iframe) return;
      const r = iframe.getBoundingClientRect();
      applyLive({
        zoom: liveViewRef.current.zoom,
        ...clampPanToFrame(
          startPanX + dx,
          startPanY + dy,
          r.width,
          r.height,
          box.width,
          box.height,
        ),
      });
    },
    [applyLive, geometryRef, iframeRef],
  );

  // Drag the canvas handle strip to pan — a discoverable, mouse-only
  // alternative to space-drag. Pointer capture keeps the gesture alive once the
  // pointer leaves the strip.
  const onHandlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>): void => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startPanX = liveViewRef.current.panX;
      const startPanY = liveViewRef.current.panY;
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      const onMove = (ev: PointerEvent): void =>
        panByClientDelta(
          ev.clientX - startX,
          ev.clientY - startY,
          startPanX,
          startPanY,
        );
      const onUp = (): void => {
        commitLive();
        el.releasePointerCapture(e.pointerId);
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onUp);
      };
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
    },
    [panByClientDelta, commitLive],
  );

  // Keep the live ref in sync with the store between gestures, so discrete
  // actions (toolbar zoom, device switch, shortcuts) seed the next gesture.
  useEffect(() => {
    if (!gesturingRef.current) liveViewRef.current = { zoom, panX, panY };
  }, [zoom, panX, panY]);

  // Don't leave a pending commit dangling on unmount.
  useEffect(
    () => () => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    },
    [],
  );

  // While a gesture is live, re-assert the imperative transform after every
  // render (before paint) so an incidental re-render can't flash the stale
  // committed value. The per-frame writes happen in applyLive; this covers
  // renders.
  useLayoutEffect(() => {
    if (gesturingRef.current && stageRef.current) {
      const v = liveViewRef.current;
      stageRef.current.style.transform = `translate(${String(v.panX)}px, ${String(v.panY)}px) scale(${String(v.zoom)})`;
    }
  });

  // The free-canvas wheel gesture, shared by the host's own wheel (over the
  // margins) and the iframe-forwarded wheel (over the canvas). `cx/cy` are the
  // cursor in container space; the base view is the live ref so consecutive
  // events accumulate, and the iframe rect reflects the live transform.
  const handleWheel = useCallback(
    (
      deltaX: number,
      deltaY: number,
      zoomIntent: boolean,
      cx: number,
      cy: number,
    ): void => {
      const iframe = iframeRef.current;
      const box = geometryRef.current.container;
      if (!iframe || !box) return;
      const rect = iframe.getBoundingClientRect();
      const view = liveViewRef.current;
      const next = wheelToView(
        view,
        { deltaX, deltaY, zoomIntent },
        { cx, cy },
        { width: rect.width, height: rect.height },
        { width: box.width, height: box.height },
      );
      // A zoom already at a limit returns the same view — skip the redundant
      // gesture write.
      if (next !== view) applyLive(next);
    },
    [applyLive, geometryRef, iframeRef],
  );

  // Frame the active block in the viewport (Shift+2) — the move that makes a
  // free canvas genuinely better for editing, not just nicer to look at.
  const zoomToSelection = useCallback((): void => {
    const { activeId } = editor.getState();
    const box = geometryRef.current.container;
    const rect = activeId ? geometryRef.current.rects.get(activeId) : undefined;
    if (!box || !rect || rect.width === 0 || rect.height === 0) return;
    camera.getState().applyView(frameSelection(rect, box.width, box.height));
  }, [editor, camera, geometryRef]);

  const centerSelection = useCallback((): void => {
    const { activeId } = editor.getState();
    const box = geometryRef.current.container;
    const rect = activeId ? geometryRef.current.rects.get(activeId) : undefined;
    if (!box || !rect) return;
    const view = camera.getState();
    camera
      .getState()
      .applyView(centerOnRect(rect, view, box.width, box.height));
  }, [editor, camera, geometryRef]);

  // Host-side wheel: pan/zoom when the cursor is over the margin around the
  // frame. Over the iframe the gesture is forwarded via the bridge. Native +
  // non-passive so we can preventDefault the page scroll.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const box = el.getBoundingClientRect();
      handleWheel(
        e.deltaX,
        e.deltaY,
        e.ctrlKey || e.metaKey,
        e.clientX - box.left,
        e.clientY - box.top,
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [handleWheel, containerRef]);

  return {
    stageRef,
    gesturing,
    liveViewRef,
    panByClientDelta,
    commitLive,
    onHandlePointerDown,
    handleWheel,
    zoomToSelection,
    centerSelection,
  };
}

import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { BlockRect, SlotRect } from "@plumix/blocks/renderer";

import type { Geometry } from "./canvas-geometry.js";
import { CANVAS_HEIGHT } from "./canvas-geometry.js";
import { clampPanToFrame, fitView } from "./canvas-view.js";
import { useEditorStore, useEditorStoreApi } from "./provider.js";

export interface CanvasGeometry {
  /** Live geometry for the render (overlays, drop indicators). */
  readonly geometry: Geometry;
  /** Same geometry, mirrored in a ref so pan/zoom + drag read fresh rects
   *  without re-subscribing their window listeners on every report. */
  readonly geometryRef: RefObject<Geometry>;
  /** The iframe's own document height, so the stage sizes to its content. */
  readonly contentHeight: number | null;
  /** Re-read the iframe's document height (e.g. on iframe load). */
  readonly measureContent: () => void;
  /** Apply a fresh block/slot geometry report from the bridge. */
  readonly applyReport: (
    reported: readonly BlockRect[],
    slots: readonly SlotRect[],
  ) => void;
}

/**
 * Owns the canvas iframe geometry: the reported block/slot rects plus the
 * iframe's live on-screen offset and the viewport box, kept fresh across scroll,
 * resize, rail-collapse, fit mode, and post-pan re-measures. The pure clamp/fit
 * math lives in `canvas-view.ts`; this wires it to the DOM and the store.
 */
export function useCanvasGeometry({
  iframeRef,
  containerRef,
  frameWidth,
}: {
  readonly iframeRef: RefObject<HTMLIFrameElement | null>;
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly frameWidth: number;
}): CanvasGeometry {
  const store = useEditorStoreApi();
  const zoomFit = useEditorStore((s) => s.zoomFit);
  const zoom = useEditorStore((s) => s.zoom);
  const panX = useEditorStore((s) => s.panX);
  const panY = useEditorStore((s) => s.panY);

  const [geometry, setGeometry] = useState<Geometry>({
    rects: new Map(),
    slots: [],
    frame: null,
    container: null,
  });
  const geometryRef = useRef<Geometry>(geometry);
  const [contentHeight, setContentHeight] = useState<number | null>(null);

  const measureContent = useCallback((): void => {
    const doc = iframeRef.current?.contentDocument;
    if (doc) setContentHeight(doc.documentElement.scrollHeight);
  }, [iframeRef]);

  // The iframe's on-screen offset and the canvas viewport box, read live from
  // the DOM. These move on scroll, window resize, and rail collapse — none of
  // which re-fire the iframe's tree-keyed geometry report — so they're measured
  // here and refreshed by the observer effect below, not just on block reports.
  const measureHost = useCallback((): Pick<Geometry, "frame" | "container"> => {
    const rect = iframeRef.current?.getBoundingClientRect();
    const box = containerRef.current?.getBoundingClientRect();
    return {
      frame: rect ? { left: rect.left, top: rect.top } : null,
      container: box
        ? { left: box.left, top: box.top, width: box.width, height: box.height }
        : null,
    };
  }, [iframeRef, containerRef]);

  const applyReport = useCallback(
    (reported: readonly BlockRect[], slots: readonly SlotRect[]): void => {
      const next: Geometry = {
        rects: new Map(reported.map((r) => [r.id, r])),
        slots,
        ...measureHost(),
      };
      geometryRef.current = next;
      setGeometry(next);
      // A fresh geometry report follows a tree change, so the document height
      // may have shifted too.
      measureContent();
    },
    [measureHost, measureContent],
  );

  // Keep frame/container fresh when the canvas moves without a block report:
  // column scroll, window resize, and rail collapse (which resizes the inset).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const refresh = (): void => {
      const next = { ...geometryRef.current, ...measureHost() };
      geometryRef.current = next;
      setGeometry(next);
    };
    el.addEventListener("scroll", refresh, { passive: true });
    window.addEventListener("resize", refresh);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(refresh);
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", refresh);
      window.removeEventListener("resize", refresh);
      observer?.disconnect();
    };
  }, [measureHost, containerRef]);

  // Fit-and-center: while in fit mode, scale the frame to the viewport width
  // (never past 100%) AND center it. This is what a device switch lands on
  // (setDevice re-enables fit), so the frame is always on-screen and centered
  // instead of pinned to the top-left. A manual pan/zoom leaves fit mode.
  const containerWidth = geometry.container?.width;
  const containerHeight = geometry.container?.height;
  useEffect(() => {
    if (!zoomFit || !containerWidth || !containerHeight) return;
    const next = fitView(
      frameWidth,
      contentHeight ?? CANVAS_HEIGHT,
      containerWidth,
      containerHeight,
    );
    const s = store.getState();
    if (s.zoom !== next.zoom || s.panX !== next.panX || s.panY !== next.panY) {
      s.applyFitView(next);
    }
  }, [
    zoomFit,
    frameWidth,
    contentHeight,
    containerWidth,
    containerHeight,
    store,
  ]);

  // The stage transform moves the iframe without firing scroll, so re-measure
  // the frame/container rects after a pan/zoom paints — the overlays read the
  // iframe's live on-screen box and must track it.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const next = { ...geometryRef.current, ...measureHost() };
      geometryRef.current = next;
      setGeometry(next);
      // Keep the frame reachable after a manual zoom (e.g. the toolbar +/-,
      // which zoom from the center and could otherwise drift it off-stage). The
      // fit effect owns pan while in fit mode, so only clamp manual views.
      const iframe = iframeRef.current;
      const s = store.getState();
      if (next.container && iframe && !s.zoomFit) {
        const r = iframe.getBoundingClientRect();
        const p = clampPanToFrame(
          s.panX,
          s.panY,
          r.width,
          r.height,
          next.container.width,
          next.container.height,
        );
        if (p.panX !== s.panX || p.panY !== s.panY) s.setPan(p.panX, p.panY);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [
    panX,
    panY,
    zoom,
    frameWidth,
    contentHeight,
    measureHost,
    store,
    iframeRef,
  ]);

  // Mirror the viewport size into the store so toolbar zoom-to-center has the
  // dims it needs without reaching into the DOM.
  useEffect(() => {
    if (containerWidth && containerHeight) {
      store.getState().setViewport(containerWidth, containerHeight);
    }
  }, [containerWidth, containerHeight, store]);

  return { geometry, geometryRef, contentHeight, measureContent, applyReport };
}

import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { BlockRect, SlotRect } from "@plumix/core/blocks/renderer";

import type { Geometry } from "./canvas-geometry.js";
import { CANVAS_HEIGHT } from "./canvas-geometry.js";
import { reconcileView } from "./canvas-view.js";
import { useCameraStore, useCameraStoreApi } from "./provider.js";

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

export function useCanvasGeometry({
  iframeRef,
  containerRef,
  frameWidth,
}: {
  readonly iframeRef: RefObject<HTMLIFrameElement | null>;
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly frameWidth: number;
}): CanvasGeometry {
  const camera = useCameraStoreApi();
  const zoomFit = useCameraStore((s) => s.fit);
  const zoom = useCameraStore((s) => s.zoom);
  const panX = useCameraStore((s) => s.panX);
  const panY = useCameraStore((s) => s.panY);

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

  // Scroll, resize and rail collapse move these without re-firing the iframe's
  // tree-keyed geometry report.
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

  const containerWidth = geometry.container?.width;
  const containerHeight = geometry.container?.height;
  useEffect(() => {
    if (!zoomFit || !containerWidth || !containerHeight) return;
    const s = camera.getState();
    const next = reconcileView({
      fit: true,
      view: { zoom: s.zoom, panX: s.panX, panY: s.panY },
      frameWidth,
      contentHeight: contentHeight ?? CANVAS_HEIGHT,
      viewport: { width: containerWidth, height: containerHeight },
    });
    if (next) s.applyView(next, { fit: true });
  }, [
    zoomFit,
    frameWidth,
    contentHeight,
    containerWidth,
    containerHeight,
    camera,
  ]);

  // The stage transform moves the iframe without firing scroll, so re-measure
  // the frame/container rects after a pan/zoom paints — the overlays read the
  // iframe's live on-screen box and must track it.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const next = { ...geometryRef.current, ...measureHost() };
      geometryRef.current = next;
      setGeometry(next);
      // A center zoom can drift the frame off-stage. The fit effect owns pan in
      // fit mode.
      const iframe = iframeRef.current;
      const s = camera.getState();
      if (next.container && iframe && !s.fit) {
        const r = iframe.getBoundingClientRect();
        const clamped = reconcileView({
          fit: false,
          view: { zoom: s.zoom, panX: s.panX, panY: s.panY },
          scaledFrame: { width: r.width, height: r.height },
          viewport: {
            width: next.container.width,
            height: next.container.height,
          },
        });
        if (clamped) s.applyView(clamped);
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
    camera,
    iframeRef,
  ]);

  // Mirror the viewport size into the store so toolbar zoom-to-center has the
  // dims it needs without reaching into the DOM.
  useEffect(() => {
    if (containerWidth && containerHeight) {
      camera.getState().setViewport(containerWidth, containerHeight);
    }
  }, [containerWidth, containerHeight, camera]);

  return { geometry, geometryRef, contentHeight, measureContent, applyReport };
}

import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";

import type { BlockRect } from "@plumix/blocks/renderer";

import type { FrameOffset } from "./overlay.js";
import { connectCanvas } from "./connect-canvas.js";
import { overlayBox } from "./overlay.js";
import { useEditorStore, useEditorStoreApi } from "./provider.js";
import { DEVICE_WIDTH } from "./store.js";

interface CanvasFrameProps {
  /** URL the iframe loads — the entry's real route with `?plumix.edit`. */
  readonly previewUrl: string;
  /** Origin of that route, for bridge message pinning. */
  readonly origin: string;
}

const SELECTED_OUTLINE = "#2563eb";
const HOVER_OUTLINE = "rgba(37,99,235,0.4)";
const CANVAS_HEIGHT = 800;

/**
 * Host-side canvas: loads the real route in an iframe, drives it via the
 * bridge, and draws selection/hover overlays in the shell's coordinate space
 * (computed from the canvas-reported geometry, so they stay aligned at zoom).
 */
export function CanvasFrame({
  previewUrl,
  origin,
}: CanvasFrameProps): ReactElement {
  const store = useEditorStoreApi();
  const device = useEditorStore((s) => s.device);
  const zoom = useEditorStore((s) => s.zoom);
  const activeId = useEditorStore((s) => s.activeId);
  const hoverId = useEditorStore((s) => s.hoverId);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Captured together in the geometry callback — never read the ref in render.
  const [geometry, setGeometry] = useState<{
    readonly rects: ReadonlyMap<string, BlockRect>;
    readonly frame: FrameOffset | null;
  }>({ rects: new Map(), frame: null });

  useEffect(() => {
    const frameWindow = iframeRef.current?.contentWindow;
    if (!frameWindow) return;
    const connection = connectCanvas({
      store,
      frameWindow,
      origin,
      onGeometry: (reported) => {
        const frame = iframeRef.current?.getBoundingClientRect();
        setGeometry({
          rects: new Map(reported.map((r) => [r.id, r])),
          frame: frame ? { left: frame.left, top: frame.top } : null,
        });
      },
    });
    return () => connection.dispose();
  }, [store, origin]);

  const overlay = (
    id: string | null,
    color: string,
    testId: string,
  ): ReactElement | null => {
    if (!id || !geometry.frame) return null;
    const rect = geometry.rects.get(id);
    if (!rect) return null;
    const box = overlayBox(rect, geometry.frame, zoom);
    return (
      <div
        data-testid={testId}
        style={{
          position: "fixed",
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          outline: `2px solid ${color}`,
          pointerEvents: "none",
          zIndex: 10,
        }}
      />
    );
  };

  return (
    <div
      data-testid="plumix-canvas-frame"
      style={{ position: "relative", flex: 1, overflow: "auto" }}
    >
      <iframe
        ref={iframeRef}
        src={previewUrl}
        title="plumix-editor-canvas"
        style={{
          width: DEVICE_WIDTH[device],
          height: CANVAS_HEIGHT,
          border: 0,
          transform: `scale(${String(zoom)})`,
          transformOrigin: "top left",
        }}
      />
      {overlay(hoverId, HOVER_OUTLINE, "plumix-overlay-hover")}
      {overlay(activeId, SELECTED_OUTLINE, "plumix-overlay-selected")}
    </div>
  );
}

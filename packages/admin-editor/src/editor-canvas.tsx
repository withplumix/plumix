import type { MouseEvent, ReactElement } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { BlockNode, BlockRegistry } from "@plumix/blocks";
import type { BlockRect, SlotRect } from "@plumix/blocks/renderer";
import { renderBlockTree } from "@plumix/blocks";
import { PlumixProvider } from "@plumix/blocks/renderer";

import type { RuntimeConnection } from "./connect-runtime.js";
import { connectRuntime } from "./connect-runtime.js";

interface EditorCanvasProps {
  /** Block registry for the site (core + plugin blocks). */
  readonly registry: BlockRegistry;
  /** Expected origin of the host (admin shell). */
  readonly origin: string;
  /** Seed tree for first paint, before the host pushes (from the SSR embed). */
  readonly initialTree?: readonly BlockNode[];
}

/**
 * The canvas that runs inside the editor iframe. Renders the host's tree via
 * the real BlockRenderer in edit mode (so blocks are tagged with
 * data-plumix-id), and reports the author's clicks + block geometry back. It
 * never owns the tree — the host does.
 */
export function EditorCanvas({
  registry,
  origin,
  initialTree = [],
}: EditorCanvasProps): ReactElement {
  const [tree, setTree] = useState<readonly BlockNode[]>(initialTree);
  const connectionRef = useRef<RuntimeConnection | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const connection = connectRuntime({
      parentWindow: window.parent,
      origin,
      onTree: setTree,
    });
    connectionRef.current = connection;
    return () => {
      connection.dispose();
      connectionRef.current = null;
    };
  }, [origin]);

  const reportGeometry = useCallback((): void => {
    const root = containerRef.current;
    const connection = connectionRef.current;
    if (!root || !connection) return;
    const rects: BlockRect[] = [];
    root.querySelectorAll<HTMLElement>("[data-plumix-id]").forEach((el) => {
      const id = el.dataset.plumixId;
      if (!id) return;
      const r = el.getBoundingClientRect();
      rects.push({ id, x: r.left, y: r.top, width: r.width, height: r.height });
    });
    // Slot markers are display:contents (no box of their own), so a slot's drop
    // region is the union of its direct children's rects — block rows for a
    // filled slot, the min-height placeholder for an empty one.
    const slots: SlotRect[] = [];
    root
      .querySelectorAll<HTMLElement>("[data-plumix-slot-parent]")
      .forEach((el) => {
        const parentId = el.dataset.plumixSlotParent;
        const slotKey = el.dataset.plumixSlotKey;
        if (!parentId || slotKey === undefined) return;
        const region = unionRect(
          [...el.children].map((c) => c.getBoundingClientRect()),
        );
        if (region) slots.push({ parentId, slotKey, ...region });
      });
    connection.reportGeometry(rects, slots);
  }, []);

  useLayoutEffect(() => {
    reportGeometry();
  }, [tree, reportGeometry]);

  const blockIdAt = (event: MouseEvent<HTMLDivElement>): string | null => {
    const block = (event.target as HTMLElement).closest("[data-plumix-id]");
    return block?.getAttribute("data-plumix-id") ?? null;
  };

  const handleClick = (event: MouseEvent<HTMLDivElement>): void => {
    const id = blockIdAt(event);
    if (!id) return;
    // Shift / cmd / ctrl extend the selection rather than replacing it.
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    connectionRef.current?.reportSelect(id, additive);
  };

  const handleMouseOver = (event: MouseEvent<HTMLDivElement>): void => {
    connectionRef.current?.reportHover(blockIdAt(event));
  };

  const handleMouseOut = (): void => {
    connectionRef.current?.reportHover(null);
  };

  return (
    <PlumixProvider value={{ registry, mode: "edit" }}>
      <div
        ref={containerRef}
        data-testid="plumix-editor-canvas"
        onClick={handleClick}
        onMouseOver={handleMouseOver}
        onMouseOut={handleMouseOut}
      >
        {/* renderBlockTree (not BlockRenderer) so the canvas doesn't re-emit
            the SSR content-root boundary it was mounted into — just the
            per-block data-plumix-id seam for selection. */}
        {renderBlockTree(tree, registry, { editing: true })}
      </div>
    </PlumixProvider>
  );
}

// Bounding box covering all rects, or null when there are none.
function unionRect(
  rects: readonly DOMRect[],
): { x: number; y: number; width: number; height: number } | null {
  if (rects.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const r of rects) {
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

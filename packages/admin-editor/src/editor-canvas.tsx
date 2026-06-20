import type { MouseEvent, ReactElement } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { BlockNode, BlockRegistry } from "@plumix/blocks";
import type { BlockRect } from "@plumix/blocks/renderer";
import { BlockRenderer, PlumixProvider } from "@plumix/blocks/renderer";

import type { RuntimeConnection } from "./connect-runtime.js";
import { connectRuntime } from "./connect-runtime.js";

interface EditorCanvasProps {
  /** Block registry for the site (core + plugin blocks). */
  readonly registry: BlockRegistry;
  /** Expected origin of the host (admin shell). */
  readonly origin: string;
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
}: EditorCanvasProps): ReactElement {
  const [tree, setTree] = useState<readonly BlockNode[]>([]);
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
    connection.reportGeometry(rects);
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
    if (id) connectionRef.current?.reportSelect(id);
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
        <BlockRenderer content={{ version: "plumix.v2", blocks: tree }} />
      </div>
    </PlumixProvider>
  );
}

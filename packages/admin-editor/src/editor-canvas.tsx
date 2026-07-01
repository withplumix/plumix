import type { MouseEvent, ReactElement } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type {
  BlockNode,
  BlockRegistry,
  ResolvedBlockLoaders,
  ThemeBreakpoints,
  ThemeTokens,
} from "@plumix/blocks";
import type { BlockRect, SlotRect } from "@plumix/blocks/renderer";
import { editAppender, parseLoaderData, renderBlockTree } from "@plumix/blocks";
import { PlumixProvider } from "@plumix/blocks/renderer";

import type { RuntimeConnection } from "./connect-runtime.js";
import { clipboardOpFromEvent } from "./clipboard-ops.js";
import { connectRuntime } from "./connect-runtime.js";
import { mergeLoaderData } from "./merge-loader-data.js";

interface EditorCanvasProps {
  /** Block registry for the site (core + plugin blocks). */
  readonly registry: BlockRegistry;
  /** Expected origin of the host (admin shell). */
  readonly origin: string;
  /** Seed tree for first paint, before the host pushes (from the SSR embed). */
  readonly initialTree?: readonly BlockNode[];
  /** Theme tokens (from the SSR embed), feeding the Styles tab's token picker so
   *  authors can pre-select a registered token. Block-style CSS emits from the
   *  stored value strings directly, so the walker itself needs no tokens. */
  readonly tokens?: ThemeTokens;
  /** Theme breakpoints (from the SSR embed), so the canvas's responsive style
   *  CSS gates at the same widths the live render uses. */
  readonly breakpoints?: ThemeBreakpoints;
}

// X-ray outline rule, gated by data-plumix-xray on the content root. Static, so
// the toggle is a pure attribute flip — no per-block geometry.
const XRAY_STYLE = `[data-plumix-xray] [data-plumix-block] {
  outline: 1px dashed rgba(59, 130, 246, 0.5);
  outline-offset: -1px;
}`;

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
  tokens,
  breakpoints,
}: EditorCanvasProps): ReactElement {
  const [tree, setTree] = useState<readonly BlockNode[]>(initialTree);
  // Seed loader data from the SSR embed once (before React replaces the mount
  // root's children). Kept stable across tree edits so loaders never re-run on
  // a keystroke; a scoped refresh replaces a single block's entry.
  const [loaderData, setLoaderData] = useState<ResolvedBlockLoaders>(() =>
    parseLoaderData(
      document.querySelector("[data-plumix-loader-data]")?.textContent ?? "",
    ),
  );
  // Canvas chrome the host resolves (it owns Lingui; the canvas has none).
  // Undefined until config arrives, so editAppender's own default is the single
  // English fallback for the pre-config window.
  const [addBlockLabel, setAddBlockLabel] = useState<string>();
  // X-ray view: the host pushes the toggle over the bridge; a CSS rule (gated by
  // the data-plumix-xray attribute below) then outlines every block.
  const [xray, setXray] = useState(false);
  const connectionRef = useRef<RuntimeConnection | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const connection = connectRuntime({
      parentWindow: window.parent,
      origin,
      onTree: setTree,
      onLoaderData: (data) =>
        setLoaderData((prior) => mergeLoaderData(prior, data)),
      onConfig: (config) => setAddBlockLabel(config.addBlockLabel),
      onXray: setXray,
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

  // Re-report after async layout shifts that aren't tree changes — late image
  // loads, web-font swap, island hydration — so the host's content-height sizing
  // and overlay rects track the settled document, not just the initial paint.
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => reportGeometry());
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, [reportGeometry]);

  // Forward wheel/trackpad gestures to the host so it can pan/zoom the free
  // canvas — events over the iframe never bubble to the parent stage. Native
  // + non-passive so we can preventDefault and stop the iframe scrolling itself
  // under the host's transform.
  useEffect(() => {
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      connectionRef.current?.reportWheel(
        e.deltaX,
        e.deltaY,
        e.ctrlKey || e.metaKey,
        e.clientX,
        e.clientY,
      );
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  // Forward the canvas-view keys (space to pan, shift+digit to zoom) so those
  // shortcuts work while focus is inside the iframe. Only these keys — typing
  // in the canvas is otherwise untouched. Space is prevented so it doesn't
  // scroll the iframe document.
  useEffect(() => {
    const isTyping = (t: EventTarget | null): boolean =>
      t instanceof HTMLElement &&
      (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const isViewKey = (e: KeyboardEvent): boolean =>
      e.code === "Space" ||
      (e.shiftKey &&
        (e.code === "Digit0" ||
          e.code === "Digit1" ||
          e.code === "Digit2" ||
          e.code === "KeyX"));
    const onKeyDown = (e: KeyboardEvent): void => {
      // Skip auto-repeat (a held key must not re-fire the toggle) and typing in
      // a field, so a view shortcut never fires while the author edits content.
      if (e.repeat || isTyping(e.target) || !isViewKey(e)) return;
      if (e.code === "Space") e.preventDefault();
      connectionRef.current?.reportKey(true, e.code, e.shiftKey);
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.code !== "Space") return;
      connectionRef.current?.reportKey(false, e.code, e.shiftKey);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Forward block clipboard shortcuts (Cmd/Ctrl+C/X/V) to the host, which owns
  // the tree + clipboard. Defers to native copy when there's a real text
  // selection, and to the field's own clipboard while typing.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const op = clipboardOpFromEvent(e);
      if (!op) return;
      e.preventDefault();
      connectionRef.current?.reportClipboard(op);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Layer 1 — navigation guard. The canvas renders the entry's real themed
  // route, so its links and forms are live and would carry the iframe off the
  // entry. Neutralize at capture phase (ahead of theme JS). We preventDefault
  // but deliberately do NOT stopPropagation: the click still bubbles to
  // handleClick so an in-content link block stays selectable — it just doesn't
  // navigate. Covers chrome links too (belt-and-suspenders with layer 2).
  useEffect(() => {
    const onClickCapture = (event: Event): void => {
      if ((event.target as HTMLElement | null)?.closest("a[href]")) {
        event.preventDefault();
      }
    };
    const onSubmitCapture = (event: Event): void => event.preventDefault();
    // `auxclick` covers middle-click, which doesn't fire `click` — without it a
    // middle-click would open the themed route in a new tab.
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("auxclick", onClickCapture, true);
    document.addEventListener("submit", onSubmitCapture, true);
    return () => {
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("auxclick", onClickCapture, true);
      document.removeEventListener("submit", onSubmitCapture, true);
    };
  }, []);

  // Layer 2 — isolate the editable content. The entry's blocks render inside the
  // content root (this container); the theme chrome (header/footer/nav) is
  // everything else on the page. Mark those off-path regions `inert` so they
  // render faithfully but take no clicks, hover, focus or theme-JS events —
  // mirroring Gutenberg's `disabled` block editing mode. Walks root→body,
  // disabling each ancestor's other children so only the content branch stays
  // live. Anchors on the SSR `[data-plumix-content-root]` (production, where the
  // theme wraps it in chrome), falling back to this container (the standalone
  // playground, which has no content-root marker).
  useEffect(() => {
    const root =
      document.querySelector<HTMLElement>("[data-plumix-content-root]") ??
      containerRef.current;
    if (!root) return;
    // Track whether we added `inert` so cleanup never strips chrome the theme
    // had already marked inert itself.
    const touched: { el: HTMLElement; addedInert: boolean }[] = [];
    let node: HTMLElement = root;
    while (node !== document.body) {
      const parent = node.parentElement;
      if (!parent) break;
      for (const sibling of Array.from(parent.children)) {
        if (sibling !== node && sibling instanceof HTMLElement) {
          const addedInert = !sibling.hasAttribute("inert");
          if (addedInert) sibling.setAttribute("inert", "");
          sibling.setAttribute("data-plumix-chrome", "");
          touched.push({ el: sibling, addedInert });
        }
      }
      node = parent;
    }
    return () => {
      for (const { el, addedInert } of touched) {
        if (addedInert) el.removeAttribute("inert");
        el.removeAttribute("data-plumix-chrome");
      }
    };
  }, []);

  const blockIdAt = (event: MouseEvent<HTMLDivElement>): string | null => {
    const block = (event.target as HTMLElement).closest("[data-plumix-id]");
    return block?.getAttribute("data-plumix-id") ?? null;
  };

  const handleClick = (event: MouseEvent<HTMLDivElement>): void => {
    // An in-canvas "Add a block" affordance (root or empty slot) takes
    // precedence over selection — it lives inside the parent block's box.
    const add = (event.target as HTMLElement).closest("[data-plumix-add]");
    if (add) {
      connectionRef.current?.reportRequestAdd(
        add.getAttribute("data-plumix-add-parent") ?? undefined,
        add.getAttribute("data-plumix-add-slot") ?? undefined,
      );
      return;
    }
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
    <PlumixProvider value={{ registry, mode: "edit", tokens, breakpoints }}>
      <div
        ref={containerRef}
        data-testid="plumix-editor-canvas"
        data-plumix-xray={xray ? "" : undefined}
        onClick={handleClick}
        onMouseOver={handleMouseOver}
        onMouseOut={handleMouseOut}
      >
        {/* X-ray outline rule; the data-plumix-xray attribute above gates it. */}
        <style>{XRAY_STYLE}</style>
        {/* renderBlockTree (not BlockRenderer) so the canvas doesn't re-emit
            the SSR content-root boundary it was mounted into — just the
            per-block data-plumix-id seam for selection. tokens/breakpoints feed
            the per-block style emitter so token-or-custom edits paint live. */}
        {tree.length === 0 ? (
          // Empty document: the same in-canvas appender an empty slot shows,
          // flowing in content rather than as a host overlay.
          <div style={{ padding: "2rem" }}>
            {editAppender(undefined, addBlockLabel)}
          </div>
        ) : (
          renderBlockTree(tree, registry, {
            editing: true,
            loaderData,
            breakpoints,
            addBlockLabel,
          })
        )}
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

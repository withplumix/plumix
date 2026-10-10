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
  HtmlAllowlist,
  HydratedEntry,
  ResolvedBlockLoaders,
  ShortcodeRegistry,
  SiteSettings,
  ThemeBreakpoints,
  ThemeTokens,
} from "@plumix/core/blocks";
import type {
  BlockRect,
  CanvasConfig,
  SlotRect,
} from "@plumix/core/blocks/renderer";
import {
  BASELINE_HTML_ALLOWLIST,
  createMessageResolver,
  DEFAULT_BLOCK_CONTEXT,
  editAppender,
  HtmlAllowlistProvider,
  parseLoaderData,
} from "@plumix/core/blocks";
import { BlockTree, PlumixProvider } from "@plumix/core/blocks/renderer";

import type { RuntimeConnection } from "./connect-runtime.js";
import { clipboardOpFromEvent } from "./clipboard-ops.js";
import { connectRuntime } from "./connect-runtime.js";
import { mergeLoaderData } from "./merge-loader-data.js";
import { forwardedShortcut, isTypingTarget } from "./shortcuts.js";

interface EditorCanvasProps {
  readonly registry: BlockRegistry;
  readonly shortcodes?: ShortcodeRegistry;
  // Expected origin of the host (admin shell).
  readonly origin: string;
  // Seed tree for first paint, before the host pushes.
  readonly initialTree?: readonly BlockNode[];
  readonly tokens?: ThemeTokens;
  readonly breakpoints?: ThemeBreakpoints;
  readonly htmlAllowlist?: HtmlAllowlist;
  readonly locale?: string;
  // JSON-lossy: it came through the SSR embed.
  readonly entry?: HydratedEntry | null;
  readonly siteSettings?: SiteSettings;
}

// X-ray outline rule, gated by data-plumix-xray on the content root. Static, so
// the toggle is a pure attribute flip — no per-block geometry.
const XRAY_STYLE = `[data-plumix-xray] [data-plumix-block] {
  outline: 1px dashed rgba(59, 130, 246, 0.5);
  outline-offset: -1px;
}`;

/** Runs inside the editor iframe and never owns the tree; the host does. */
export function EditorCanvas({
  registry,
  shortcodes,
  origin,
  initialTree = [],
  tokens,
  breakpoints,
  htmlAllowlist = BASELINE_HTML_ALLOWLIST,
  locale,
  entry,
  siteSettings,
}: EditorCanvasProps): ReactElement {
  const [tree, setTree] = useState<readonly BlockNode[]>(initialTree);
  // Read once, before React replaces the mount root's children; stable across
  // edits so loaders never re-run on a keystroke.
  const [loaderData, setLoaderData] = useState<ResolvedBlockLoaders>(() =>
    parseLoaderData(
      document.querySelector("[data-plumix-loader-data]")?.textContent ?? "",
    ),
  );
  // The host's locale + catalog (it owns Lingui; the canvas has none).
  // Undefined until config arrives, so the pre-config window renders English.
  const [config, setConfig] = useState<CanvasConfig>();
  // X-ray view: the host pushes the toggle over the bridge; a CSS rule (gated
  // by the data-plumix-xray attribute below) then outlines every block.
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
      onConfig: setConfig,
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
    // Slot markers are display:contents, so a slot's region is the union of its
    // direct children's rects.
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

  // Late image loads, font swaps and island hydration shift layout without a
  // tree change.
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => reportGeometry());
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, [reportGeometry]);

  // Events over the iframe never bubble to the host stage. Non-passive so the
  // iframe doesn't scroll itself under the host's transform.
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

  // Host shortcuts must work while focus is inside the iframe.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      // Skip auto-repeat (a held key must not re-fire the toggle) and typing in
      // a field, so a view shortcut never fires while the author edits content.
      if (e.repeat || isTypingTarget(e.target)) return;
      const claimed = forwardedShortcut(e);
      if (!claimed) return;
      // Space would scroll the iframe document; Cmd+/ is quick-find in Firefox,
      // Cmd+K jumps to the browser's own search bar and Cmd+B opens Firefox's
      // bookmarks sidebar.
      if (
        claimed.id === "canvas.pan" ||
        claimed.id === "help.open" ||
        claimed.id === "palette.open" ||
        claimed.id === "panels.toggle"
      ) {
        e.preventDefault();
      }
      connectionRef.current?.reportKey(true, claimed.code, e.shiftKey);
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      // Only the held binding has a release worth forwarding.
      if (forwardedShortcut(e)?.id !== "canvas.pan") return;
      connectionRef.current?.reportKey(false, e.code, e.shiftKey);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Defers to native copy for a real text selection, and to a field's own
  // clipboard while typing.
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

  // The themed route's links and forms are live. No stopPropagation, so an
  // in-content link block stays selectable without navigating.
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

  // Theme chrome goes `inert` so it renders but takes no events. The standalone
  // playground has no content-root marker, hence the container fallback.
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
    <HtmlAllowlistProvider value={htmlAllowlist}>
      <PlumixProvider
        value={{
          registry,
          mode: "edit",
          tokens,
          breakpoints,
          loaderData,
          // The host's locale once it arrives, so it matches the catalog the
          // host pushed alongside it; the page's until then.
          locale: config?.locale ?? locale,
          catalog: config?.catalog,
          shortcodes,
          entry,
          siteSettings,
        }}
      >
        <div
          ref={containerRef}
          data-testid="plumix-editor-canvas"
          data-plumix-xray={xray ? "" : undefined}
          onClick={handleClick}
          onMouseOver={handleMouseOver}
          onMouseOut={handleMouseOut}
        >
          {/* X-ray outline rule; the data-plumix-xray attribute above gates it. */}
          {/* eslint-disable-next-line shadcn/no-inline-styles -- the canvas mounts in the theme page's preview iframe, where the editor bootstrap injects a script and no admin stylesheet */}
          <style>{XRAY_STYLE}</style>
          {/* BlockTree (not BlockRenderer) so the canvas doesn't re-emit the
              SSR content-root boundary it was mounted into — just the
              per-block data-plumix-id seam for selection. */}
          {tree.length === 0 ? (
            // Empty document: the same in-canvas appender an empty slot shows,
            // flowing in content rather than as a host overlay.
            // eslint-disable-next-line shadcn/no-inline-styles -- renders in the theme page's preview iframe, which no admin stylesheet reaches
            <div style={{ padding: "2rem" }}>
              {editAppender(
                config
                  ? createMessageResolver(config.catalog)
                  : DEFAULT_BLOCK_CONTEXT.t,
              )}
            </div>
          ) : (
            <BlockTree blocks={tree} />
          )}
        </div>
      </PlumixProvider>
    </HtmlAllowlistProvider>
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

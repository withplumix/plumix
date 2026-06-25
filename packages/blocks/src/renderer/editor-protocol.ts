// Typed message contract for the editor bridge, shared by the admin shell
// (parent) and the SSR-injected canvas runtime (iframe). The parent owns
// the canonical tree and pushes it down; the canvas renders what it's told
// and reports user intent back. Transport/handshake live in ./bridge.

import type { BlockNode } from "../render-block-tree.js";

export const EDITOR_BRIDGE_CHANNEL = "plumix.editor";

/** Node-keyed loader records, as serialized over the bridge — the wire form of
 *  ResolvedBlockLoaders (a ReadonlyMap doesn't survive postMessage). */
export type SerializedLoaderData = Record<string, Record<string, unknown>>;

/** Geometry of one block, in the iframe's unscaled coordinate space. */
export interface BlockRect {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Geometry of one container slot — the drop region for nested inserts, in the
 *  iframe's unscaled coordinate space. */
export interface SlotRect {
  readonly parentId: string;
  readonly slotKey: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Parent (admin shell) → canvas (iframe). */
export type HostMessage =
  | { readonly type: "host:tree"; readonly tree: readonly BlockNode[] }
  | {
      // Static, locale-dependent canvas chrome the host resolves (it owns the
      // i18n runtime; the canvas does not). Sent once the canvas is ready and
      // again if the locale changes. Currently just the "Add a block" label.
      readonly type: "host:config";
      readonly addBlockLabel: string;
    }
  | {
      // A scoped refresh's re-resolved loader data, node-keyed (same shape
      // `serializeLoaderData` emits). The canvas merges it into its loader map.
      readonly type: "host:loader-data";
      readonly data: SerializedLoaderData;
    }
  | {
      // X-ray view toggle — the canvas outlines every block while on. Pushed on
      // change and once the canvas is ready (initial sync).
      readonly type: "host:xray";
      readonly enabled: boolean;
    };

/** Canvas (iframe) → parent (admin shell). */
export type CanvasMessage =
  | { readonly type: "canvas:ready" }
  | {
      readonly type: "canvas:select";
      readonly id: string;
      /** Add to the current selection instead of replacing it (shift/cmd-click). */
      readonly additive?: boolean;
    }
  | { readonly type: "canvas:hover"; readonly id: string | null }
  | {
      readonly type: "canvas:geometry";
      readonly rects: readonly BlockRect[];
      /** Container slot regions, for resolving a drag to a nested drop target. */
      readonly slots?: readonly SlotRect[];
    }
  | {
      // A wheel/trackpad gesture over the canvas, forwarded so the host can
      // pan/zoom the free canvas (events over the iframe never reach the parent
      // stage). `zoomIntent` is ctrl/⌘ held — which is also how trackpad pinch
      // arrives — so the host zooms toward the cursor instead of panning.
      // `clientX/Y` are the iframe-local pointer coords; the host maps them to
      // its own space via the live iframe rect + zoom.
      readonly type: "canvas:wheel";
      readonly deltaX: number;
      readonly deltaY: number;
      readonly zoomIntent: boolean;
      readonly clientX: number;
      readonly clientY: number;
    }
  | {
      // A canvas-view keyboard event (space to pan, shift+digit to zoom),
      // forwarded so the shortcuts work while the iframe holds focus. Only the
      // view keys are forwarded — typing in the canvas is unaffected.
      // NB: no `kind` field — the bridge's handshake frames are discriminated
      // by a string `kind`, so a `kind` here would be mistaken for one.
      readonly type: "canvas:key";
      readonly down: boolean;
      /** Layout-independent physical key, e.g. "Space", "Digit1". */
      readonly code: string;
      readonly shiftKey: boolean;
    }
  | {
      // An in-canvas "Add a block" affordance was clicked (empty root document,
      // or an empty child slot identified by parentId+slotKey). The host owns
      // the tree, so it resolves the actual insert.
      readonly type: "canvas:requestAdd";
      readonly parentId?: string;
      readonly slotKey?: string;
    }
  | {
      // A clipboard shortcut (Cmd/Ctrl+C/X/V) fired while focus was inside the
      // iframe. The host owns the tree + clipboard, so the canvas just forwards
      // the intent and the host performs it.
      readonly type: "canvas:clipboard";
      readonly op: "copy" | "cut" | "paste";
    };

export type EditorBridgeMessage = HostMessage | CanvasMessage;

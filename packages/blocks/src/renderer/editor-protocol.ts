// Typed message contract for the editor bridge, shared by the admin shell
// (parent) and the SSR-injected canvas runtime (iframe). The parent owns
// the canonical tree and pushes it down; the canvas renders what it's told
// and reports user intent back. Transport/handshake live in ./bridge.

import type { BlockNode } from "../render-block-tree.js";

export const EDITOR_BRIDGE_CHANNEL = "plumix.editor";

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
export interface HostMessage {
  readonly type: "host:tree";
  readonly tree: readonly BlockNode[];
}

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
    };

export type EditorBridgeMessage = HostMessage | CanvasMessage;

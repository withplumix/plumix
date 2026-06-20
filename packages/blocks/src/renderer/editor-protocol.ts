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

/** Parent (admin shell) → canvas (iframe). */
export type HostMessage =
  | { readonly type: "host:tree"; readonly tree: readonly BlockNode[] }
  | { readonly type: "host:select"; readonly id: string | null }
  | { readonly type: "host:hover"; readonly id: string | null };

/** Canvas (iframe) → parent (admin shell). */
export type CanvasMessage =
  | { readonly type: "canvas:ready" }
  | { readonly type: "canvas:select"; readonly id: string }
  | { readonly type: "canvas:hover"; readonly id: string | null }
  | { readonly type: "canvas:geometry"; readonly rects: readonly BlockRect[] };

export type EditorBridgeMessage = HostMessage | CanvasMessage;

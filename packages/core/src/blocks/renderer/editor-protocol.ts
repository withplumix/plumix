// The parent owns the canonical tree; the canvas renders what it's told and
// reports user intent back.

import type { JsonObject } from "../../json.js";
import type { CompiledCatalog } from "../i18n-label.js";
import type { BlockNode } from "../render-block-tree.js";

export const EDITOR_BRIDGE_CHANNEL = "plumix.editor";

/** Node-keyed loader records, as serialized over the bridge — the wire form of
 *  ResolvedBlockLoaders (a ReadonlyMap doesn't survive postMessage). JSON here,
 *  unlike the in-process bag: see `serializeLoaderData`. */
export type SerializedLoaderData = Record<string, JsonObject>;

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

/**
 * Catalogs, never resolved strings, so the canvas resolves every block string
 * the way SSR does.
 */
export interface CanvasConfig {
  readonly locale: string;
  readonly catalog: CompiledCatalog;
}

/** Parent (admin shell) → canvas (iframe). */
export type HostMessage =
  | { readonly type: "host:tree"; readonly tree: readonly BlockNode[] }
  | ({
      /**
       * The locale the canvas renders at (it has no i18n runtime of its own).
       * Sent once the canvas is ready and again if the locale changes.
       */
      readonly type: "host:config";
    } & CanvasConfig)
  | {
      /**
       * A scoped refresh's re-resolved loader data, node-keyed (same shape
       * `serializeLoaderData` emits). The canvas merges it into its loader map.
       */
      readonly type: "host:loader-data";
      readonly data: SerializedLoaderData;
    }
  | {
      /**
       * X-ray view toggle — the canvas outlines every block while on. Pushed on
       * change and once the canvas is ready (initial sync).
       */
      readonly type: "host:xray";
      readonly enabled: boolean;
    };

/** Canvas (iframe) → parent (admin shell). */
export type CanvasMessage =
  | { readonly type: "canvas:ready" }
  | {
      readonly type: "canvas:select";
      readonly id: string;
      /**
       * Add to the current selection instead of replacing it (shift/cmd-click).
       */
      readonly additive?: boolean;
    }
  | { readonly type: "canvas:hover"; readonly id: string | null }
  | {
      readonly type: "canvas:geometry";
      readonly rects: readonly BlockRect[];
      /**
       * Container slot regions, for resolving a drag to a nested drop target.
       */
      readonly slots?: readonly SlotRect[];
    }
  | {
      /**
       * Wheel events over the iframe never reach the parent. `zoomIntent` is
       * ctrl/⌘ held, which is also how trackpad pinch arrives.
       */
      readonly type: "canvas:wheel";
      readonly deltaX: number;
      readonly deltaY: number;
      readonly zoomIntent: boolean;
      readonly clientX: number;
      readonly clientY: number;
    }
  | {
      /**
       * No `kind` field: handshake frames are discriminated by `kind`, so this
       * would be mistaken for one.
       */
      readonly type: "canvas:key";
      readonly down: boolean;
      /** Layout-independent physical key, e.g. "Space", "Digit1". */
      readonly code: string;
      readonly shiftKey: boolean;
    }
  | {
      /**
       * An in-canvas "Add a block" affordance was clicked (empty root document,
       * or an empty child slot identified by parentId+slotKey). The host owns
       * the tree, so it resolves the actual insert.
       */
      readonly type: "canvas:requestAdd";
      readonly parentId?: string;
      readonly slotKey?: string;
    }
  | {
      /**
       * A clipboard shortcut (Cmd/Ctrl+C/X/V) fired while focus was inside the
       * iframe. The host owns the tree + clipboard, so the canvas just forwards
       * the intent and the host performs it.
       */
      readonly type: "canvas:clipboard";
      readonly op: "copy" | "cut" | "paste";
    };

/**
 * Travel the same envelopes as protocol messages; `isHandshakeFrame` splits
 * them back out.
 */
export type HandshakeMessage =
  { readonly kind: "hello" } | { readonly kind: "ack" };

export type EditorBridgeMessage =
  HostMessage | CanvasMessage | HandshakeMessage;

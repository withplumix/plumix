import type {
  BlockRect,
  CanvasMessage,
  HostMessage,
  SerializedLoaderData,
  SlotRect,
} from "@plumix/blocks/renderer";
import {
  createHandshake,
  EDITOR_BRIDGE_CHANNEL,
  encode,
  isHandshakeFrame,
  parseEnvelope,
} from "@plumix/blocks/renderer";

import type { EditorStoreApi } from "./store.js";

export interface CanvasConnection {
  /** Resolves once the canvas has completed the handshake. */
  readonly whenReady: Promise<void>;
  /** Push a scoped refresh's re-resolved loader data to the canvas. */
  readonly pushLoaderData: (data: SerializedLoaderData) => void;
  readonly dispose: () => void;
}

interface ConnectCanvasOptions {
  readonly store: EditorStoreApi;
  /** The iframe's `contentWindow`. */
  readonly frameWindow: Window;
  /** Expected origin of the canvas iframe; messages from elsewhere are dropped. */
  readonly origin: string;
  /** Latest block + slot geometry, for overlays and nested drop targeting. */
  readonly onGeometry?: (
    rects: readonly BlockRect[],
    slots: readonly SlotRect[],
  ) => void;
  /** A wheel/trackpad gesture over the canvas, forwarded from the iframe so the
   *  host can pan/zoom the free canvas. clientX/Y are iframe-local. */
  readonly onWheel?: (wheel: {
    readonly deltaX: number;
    readonly deltaY: number;
    readonly zoomIntent: boolean;
    readonly clientX: number;
    readonly clientY: number;
  }) => void;
  /** A canvas-view key, forwarded so pan/zoom shortcuts work over the iframe. */
  readonly onKey?: (key: {
    readonly down: boolean;
    readonly code: string;
    readonly shiftKey: boolean;
  }) => void;
  /** An in-canvas "Add a block" affordance was clicked — root or empty slot. */
  readonly onRequestAdd?: (target: {
    readonly parentId?: string;
    readonly slotKey?: string;
  }) => void;
  /** Host-resolved canvas chrome (localized labels) pushed once the canvas is
   *  ready. The canvas has no i18n runtime, so the host owns these strings. */
  readonly config?: { readonly addBlockLabel: string };
}

// The iframe runtime usually boots after the parent mounts, so a single hello
// would race; re-announce on this interval until the canvas acks.
const HANDSHAKE_RETRY_MS = 250;

/**
 * Parent half of the editor bridge. The canvas never mutates the tree — it
 * only reports intent, and this turns those reports into store actions.
 */
export function connectCanvas({
  store,
  frameWindow,
  origin,
  onGeometry,
  onWheel,
  onKey,
  onRequestAdd,
  config,
}: ConnectCanvasOptions): CanvasConnection {
  const post = (message: object): void => {
    frameWindow.postMessage(encode(EDITOR_BRIDGE_CHANNEL, message), origin);
  };
  const handshake = createHandshake({ role: "initiator", post });

  const pushTree = (): void => {
    post({
      type: "host:tree",
      tree: store.getState().tree,
    } satisfies HostMessage);
  };

  const pushConfig = (): void => {
    if (config) {
      post({
        type: "host:config",
        addBlockLabel: config.addBlockLabel,
      } satisfies HostMessage);
    }
  };

  const onMessage = (event: MessageEvent): void => {
    const message = parseEnvelope<object>(
      EDITOR_BRIDGE_CHANNEL,
      event.data,
      event.origin,
      origin,
    );
    if (!message) return;
    if (isHandshakeFrame(message)) {
      handshake.onMessage(message);
      return;
    }
    const canvas = message as CanvasMessage;
    switch (canvas.type) {
      case "canvas:ready":
        pushConfig();
        pushTree();
        break;
      case "canvas:select":
        store.getState().select(canvas.id, { additive: canvas.additive });
        break;
      case "canvas:hover":
        store.getState().setHover(canvas.id);
        break;
      case "canvas:geometry":
        onGeometry?.(canvas.rects, canvas.slots ?? []);
        break;
      case "canvas:wheel":
        onWheel?.({
          deltaX: canvas.deltaX,
          deltaY: canvas.deltaY,
          zoomIntent: canvas.zoomIntent,
          clientX: canvas.clientX,
          clientY: canvas.clientY,
        });
        break;
      case "canvas:key":
        onKey?.({
          down: canvas.down,
          code: canvas.code,
          shiftKey: canvas.shiftKey,
        });
        break;
      case "canvas:requestAdd":
        onRequestAdd?.({ parentId: canvas.parentId, slotKey: canvas.slotKey });
        break;
    }
  };

  window.addEventListener("message", onMessage);

  let previousTree = store.getState().tree;
  const unsubscribe = store.subscribe((state) => {
    if (state.tree !== previousTree) {
      previousTree = state.tree;
      pushTree();
    }
  });

  // retry() no-ops once ready, so this is safe to fire until handshake resolves.
  const retryTimer = setInterval(() => handshake.retry(), HANDSHAKE_RETRY_MS);
  const whenReady = handshake.whenReady();
  void whenReady.then(() => clearInterval(retryTimer));

  return {
    whenReady,
    pushLoaderData: (data) =>
      post({ type: "host:loader-data", data } satisfies HostMessage),
    dispose: () => {
      clearInterval(retryTimer);
      window.removeEventListener("message", onMessage);
      unsubscribe();
    },
  };
}

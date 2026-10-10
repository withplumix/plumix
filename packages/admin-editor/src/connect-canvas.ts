import type {
  BlockRect,
  CanvasConfig,
  HandshakeMessage,
  HostMessage,
  SerializedLoaderData,
  SlotRect,
} from "@plumix/core/blocks/renderer";
import {
  createHandshake,
  EDITOR_BRIDGE_CHANNEL,
  encode,
  isHandshakeFrame,
  parseEnvelope,
} from "@plumix/core/blocks/renderer";

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
  readonly frameWindow: Window;
  /** Messages from any other origin are dropped. */
  readonly origin: string;
  readonly onGeometry?: (
    rects: readonly BlockRect[],
    slots: readonly SlotRect[],
  ) => void;
  /** clientX/Y are iframe-local. */
  readonly onWheel?: (wheel: {
    readonly deltaX: number;
    readonly deltaY: number;
    readonly zoomIntent: boolean;
    readonly clientX: number;
    readonly clientY: number;
  }) => void;
  readonly onKey?: (key: {
    readonly down: boolean;
    readonly code: string;
    readonly shiftKey: boolean;
  }) => void;
  readonly onRequestAdd?: (target: {
    readonly parentId?: string;
    readonly slotKey?: string;
  }) => void;
  readonly onClipboard?: (op: "copy" | "cut" | "paste") => void;
  /** The canvas has no i18n runtime, so the host hands it the catalog. */
  readonly config?: CanvasConfig;
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
  onClipboard,
  config,
}: ConnectCanvasOptions): CanvasConnection {
  const post = (message: HostMessage | HandshakeMessage): void => {
    frameWindow.postMessage(encode(EDITOR_BRIDGE_CHANNEL, message), origin);
  };
  const handshake = createHandshake({ role: "initiator", post });

  const pushTree = (): void => {
    post({
      type: "host:tree",
      tree: store.getState().tree,
    });
  };

  const pushConfig = (): void => {
    if (config) {
      post({ type: "host:config", ...config });
    }
  };

  const pushXray = (): void => {
    post({
      type: "host:xray",
      enabled: store.getState().xray,
    });
  };

  const onMessage = (event: MessageEvent): void => {
    const message = parseEnvelope(
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
    switch (message.type) {
      case "canvas:ready":
        pushConfig();
        pushXray();
        pushTree();
        break;
      case "canvas:select":
        store.getState().select(message.id, { additive: message.additive });
        break;
      case "canvas:hover":
        store.getState().setHover(message.id);
        break;
      case "canvas:geometry":
        onGeometry?.(message.rects, message.slots ?? []);
        break;
      case "canvas:wheel":
        onWheel?.({
          deltaX: message.deltaX,
          deltaY: message.deltaY,
          zoomIntent: message.zoomIntent,
          clientX: message.clientX,
          clientY: message.clientY,
        });
        break;
      case "canvas:key":
        onKey?.({
          down: message.down,
          code: message.code,
          shiftKey: message.shiftKey,
        });
        break;
      case "canvas:requestAdd":
        onRequestAdd?.({
          parentId: message.parentId,
          slotKey: message.slotKey,
        });
        break;
      case "canvas:clipboard":
        onClipboard?.(message.op);
        break;
    }
  };

  window.addEventListener("message", onMessage);

  let previousTree = store.getState().tree;
  let previousXray = store.getState().xray;
  const unsubscribe = store.subscribe((state) => {
    if (state.tree !== previousTree) {
      previousTree = state.tree;
      pushTree();
    }
    if (state.xray !== previousXray) {
      previousXray = state.xray;
      pushXray();
    }
  });

  // retry() no-ops once ready, so this is safe to fire until handshake
  // resolves.
  const retryTimer = setInterval(() => handshake.retry(), HANDSHAKE_RETRY_MS);
  const whenReady = handshake.whenReady();
  void whenReady.then(() => clearInterval(retryTimer));

  return {
    whenReady,
    pushLoaderData: (data) => post({ type: "host:loader-data", data }),
    dispose: () => {
      clearInterval(retryTimer);
      window.removeEventListener("message", onMessage);
      unsubscribe();
    },
  };
}

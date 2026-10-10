import type { BlockNode } from "@plumix/core/blocks";
import type {
  BlockRect,
  CanvasConfig,
  CanvasMessage,
  HandshakeMessage,
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

export interface RuntimeConnection {
  readonly reportSelect: (id: string, additive?: boolean) => void;
  readonly reportHover: (id: string | null) => void;
  readonly reportGeometry: (
    rects: readonly BlockRect[],
    slots?: readonly SlotRect[],
  ) => void;
  /** Forward a wheel/trackpad gesture to the host so it can pan/zoom the free
   *  canvas. clientX/Y are iframe-local pointer coords. */
  readonly reportWheel: (
    deltaX: number,
    deltaY: number,
    zoomIntent: boolean,
    clientX: number,
    clientY: number,
  ) => void;
  /** Forward a canvas-view key (space / shift+digit) so the host's pan +
   *  zoom shortcuts work while the iframe holds focus. */
  readonly reportKey: (down: boolean, code: string, shiftKey: boolean) => void;
  /** An in-canvas "Add a block" affordance was clicked — root (no args) or an
   *  empty slot. The host resolves the insert. */
  readonly reportRequestAdd: (parentId?: string, slotKey?: string) => void;
  /** Forward a clipboard shortcut (focus is inside the iframe); the host owns
   *  the tree + clipboard and performs the op. */
  readonly reportClipboard: (op: "copy" | "cut" | "paste") => void;
  readonly dispose: () => void;
}

interface ConnectRuntimeOptions {
  readonly parentWindow: Window;
  /** Messages from any other origin are dropped. */
  readonly origin: string;
  readonly onTree: (tree: readonly BlockNode[]) => void;
  readonly onLoaderData?: (data: SerializedLoaderData) => void;
  readonly onConfig?: (config: CanvasConfig) => void;
  readonly onXray?: (enabled: boolean) => void;
}

/**
 * The canvas half of the bridge never owns the tree; it renders what the host
 * sends.
 */
export function connectRuntime({
  parentWindow,
  origin,
  onTree,
  onLoaderData,
  onConfig,
  onXray,
}: ConnectRuntimeOptions): RuntimeConnection {
  const post = (message: CanvasMessage | HandshakeMessage): void => {
    parentWindow.postMessage(encode(EDITOR_BRIDGE_CHANNEL, message), origin);
  };
  const handshake = createHandshake({ role: "responder", post });

  const announce = (): void => {
    post({ type: "canvas:ready" });
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
      // A hello means the host (re)connected and is listening — re-announce
      // so it pushes the tree even if it missed our first announce.
      if (message.kind === "hello") announce();
      return;
    }
    switch (message.type) {
      case "host:tree":
        onTree(message.tree);
        break;
      case "host:loader-data":
        onLoaderData?.(message.data);
        break;
      case "host:config":
        onConfig?.({ locale: message.locale, catalog: message.catalog });
        break;
      case "host:xray":
        onXray?.(message.enabled);
        break;
    }
  };

  window.addEventListener("message", onMessage);
  announce();

  return {
    reportSelect: (id, additive) =>
      post({
        type: "canvas:select",
        id,
        ...(additive ? { additive: true } : {}),
      }),
    reportHover: (id) => post({ type: "canvas:hover", id }),
    reportGeometry: (rects, slots) =>
      post({ type: "canvas:geometry", rects, slots }),
    reportWheel: (deltaX, deltaY, zoomIntent, clientX, clientY) =>
      post({
        type: "canvas:wheel",
        deltaX,
        deltaY,
        zoomIntent,
        clientX,
        clientY,
      }),
    reportKey: (down, code, shiftKey) =>
      post({
        type: "canvas:key",
        down,
        code,
        shiftKey,
      }),
    reportRequestAdd: (parentId, slotKey) =>
      post({
        type: "canvas:requestAdd",
        ...(parentId !== undefined && { parentId }),
        ...(slotKey !== undefined && { slotKey }),
      }),
    reportClipboard: (op) => post({ type: "canvas:clipboard", op }),
    dispose: () => window.removeEventListener("message", onMessage),
  };
}

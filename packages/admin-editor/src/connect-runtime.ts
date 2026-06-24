import type { BlockNode } from "@plumix/blocks";
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
  readonly dispose: () => void;
}

interface ConnectRuntimeOptions {
  /** The host (admin shell) window — usually `window.parent`. */
  readonly parentWindow: Window;
  /** Expected origin of the host; messages from elsewhere are dropped. */
  readonly origin: string;
  /** Called with each tree the host pushes. */
  readonly onTree: (tree: readonly BlockNode[]) => void;
  /** Called with a scoped refresh's re-resolved loader data (node-keyed). */
  readonly onLoaderData?: (data: SerializedLoaderData) => void;
}

/**
 * Canvas (iframe) half of the editor bridge. Acks the host's handshake,
 * applies the trees it pushes, and exposes report* helpers the canvas calls
 * when the author interacts. It never owns the tree — it only renders what
 * the host sends and reports intent back.
 */
export function connectRuntime({
  parentWindow,
  origin,
  onTree,
  onLoaderData,
}: ConnectRuntimeOptions): RuntimeConnection {
  const post = (message: object): void => {
    parentWindow.postMessage(encode(EDITOR_BRIDGE_CHANNEL, message), origin);
  };
  const handshake = createHandshake({ role: "responder", post });

  const announce = (): void => {
    post({ type: "canvas:ready" } satisfies CanvasMessage);
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
      // A hello means the host (re)connected and is listening — re-announce
      // so it pushes the tree even if it missed our first announce.
      if (message.kind === "hello") announce();
      return;
    }
    const host = message as HostMessage;
    switch (host.type) {
      case "host:tree":
        onTree(host.tree);
        break;
      case "host:loader-data":
        onLoaderData?.(host.data);
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
      } satisfies CanvasMessage),
    reportHover: (id) =>
      post({ type: "canvas:hover", id } satisfies CanvasMessage),
    reportGeometry: (rects, slots) =>
      post({ type: "canvas:geometry", rects, slots } satisfies CanvasMessage),
    reportWheel: (deltaX, deltaY, zoomIntent, clientX, clientY) =>
      post({
        type: "canvas:wheel",
        deltaX,
        deltaY,
        zoomIntent,
        clientX,
        clientY,
      } satisfies CanvasMessage),
    reportKey: (down, code, shiftKey) =>
      post({
        type: "canvas:key",
        down,
        code,
        shiftKey,
      } satisfies CanvasMessage),
    reportRequestAdd: (parentId, slotKey) =>
      post({
        type: "canvas:requestAdd",
        ...(parentId !== undefined && { parentId }),
        ...(slotKey !== undefined && { slotKey }),
      } satisfies CanvasMessage),
    dispose: () => window.removeEventListener("message", onMessage),
  };
}

// No transport here: the caller injects `post`, so the protocol is testable
// without an iframe.

import type {
  EditorBridgeMessage,
  HandshakeMessage,
} from "./editor-protocol.js";

export interface Envelope<M> {
  readonly channel: string;
  readonly message: M;
}

export function encode<M>(channel: string, message: M): Envelope<M> {
  return { channel, message };
}

export type HandshakeRole = "initiator" | "responder";

export interface Handshake {
  /** Feed an inbound handshake message (hello/ack). */
  onMessage(message: HandshakeMessage): void;
  /**
   * Re-post hello while still waiting for ack (driven by the caller's timer).
   */
  retry(): void;
  isReady(): boolean;
  whenReady(): Promise<void>;
}

/**
 * Owns no timers: the caller drives `retry()`. `whenReady` resolves exactly
 * once.
 */
export function createHandshake({
  role,
  post,
}: {
  readonly role: HandshakeRole;
  readonly post: (message: HandshakeMessage) => void;
}): Handshake {
  let ready = false;
  let resolveReady: () => void = () => undefined;
  const readyPromise = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  const markReady = (): void => {
    if (ready) return;
    ready = true;
    resolveReady();
  };

  if (role === "initiator") post({ kind: "hello" });

  return {
    onMessage(message) {
      if (role === "initiator" && message.kind === "ack") markReady();
      if (role === "responder" && message.kind === "hello") {
        // Re-ack every hello, even once ready: if the initiator's ack was
        // dropped, its retry resends hello and must receive a fresh ack.
        post({ kind: "ack" });
        markReady();
      }
    },
    retry() {
      if (!ready && role === "initiator") post({ kind: "hello" });
    },
    isReady: () => ready,
    whenReady: () => readyPromise,
  };
}

/** Splits the handshake frames back out of the wire union — they are the only
 *  members keyed by `kind`, which is why no protocol message may carry one. */
export function isHandshakeFrame(
  message: EditorBridgeMessage,
): message is HandshakeMessage {
  return "kind" in message;
}

/**
 * Typed, not decoded: only this bridge posts on the channel from
 * `expectedOrigin`. Returns null for anything that isn't ours.
 */
export function parseEnvelope(
  channel: string,
  raw: unknown,
  origin: string,
  expectedOrigin: string,
): EditorBridgeMessage | null {
  if (origin !== expectedOrigin) return null;
  if (raw === null || typeof raw !== "object") return null;
  const env = raw as Partial<Envelope<unknown>>;
  if (env.channel !== channel) return null;
  const message = env.message;
  if (message === null || typeof message !== "object") return null;
  return message as EditorBridgeMessage;
}

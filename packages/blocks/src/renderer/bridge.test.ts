import { describe, expect, test } from "vitest";

import { createHandshake, encode, parseEnvelope } from "./bridge.js";

const CHANNEL = "plumix.editor";
const ORIGIN = "https://admin.example";

describe("bridge envelope", () => {
  test("parseEnvelope returns the message for a matching channel and allowed origin", () => {
    const raw = encode(CHANNEL, { type: "ping" });

    expect(parseEnvelope(CHANNEL, raw, ORIGIN, ORIGIN)).toEqual({
      type: "ping",
    });
  });

  test("parseEnvelope rejects a message from a foreign origin (origin pinning)", () => {
    const raw = encode(CHANNEL, { type: "ping" });

    expect(
      parseEnvelope(CHANNEL, raw, "https://evil.example", ORIGIN),
    ).toBeNull();
  });

  test("parseEnvelope ignores traffic on a different channel and non-envelope data", () => {
    const foreign = encode("some.other.channel", { type: "ping" });
    expect(parseEnvelope(CHANNEL, foreign, ORIGIN, ORIGIN)).toBeNull();

    // Unrelated postMessage traffic (HMR, devtools, plugins) is not an envelope.
    expect(parseEnvelope(CHANNEL, "hot-update", ORIGIN, ORIGIN)).toBeNull();
    expect(parseEnvelope(CHANNEL, null, ORIGIN, ORIGIN)).toBeNull();
    // Right channel, but no message payload → not a usable envelope.
    expect(
      parseEnvelope(CHANNEL, { channel: CHANNEL }, ORIGIN, ORIGIN),
    ).toBeNull();
  });
});

describe("handshake", () => {
  test("the initiator re-posts hello until it receives ack, then resolves ready once", async () => {
    const posts: unknown[] = [];
    const hs = createHandshake({
      role: "initiator",
      post: (m) => posts.push(m),
    });

    // Posts hello on creation.
    expect(posts).toEqual([{ kind: "hello" }]);
    expect(hs.isReady()).toBe(false);

    // Re-posts while still waiting for ack.
    hs.retry();
    expect(posts).toEqual([{ kind: "hello" }, { kind: "hello" }]);

    // ack arrives → ready, whenReady resolves.
    hs.onMessage({ kind: "ack" });
    expect(hs.isReady()).toBe(true);
    await expect(hs.whenReady()).resolves.toBeUndefined();

    // Stops re-posting once ready.
    hs.retry();
    expect(posts).toHaveLength(2);
  });

  test("the responder stays quiet until a hello, then replies ack and is ready", async () => {
    const posts: unknown[] = [];
    const hs = createHandshake({
      role: "responder",
      post: (m) => posts.push(m),
    });

    // Responder does not initiate.
    expect(posts).toEqual([]);
    expect(hs.isReady()).toBe(false);

    // hello arrives → replies ack, becomes ready.
    hs.onMessage({ kind: "hello" });
    expect(posts).toEqual([{ kind: "ack" }]);
    expect(hs.isReady()).toBe(true);
    await expect(hs.whenReady()).resolves.toBeUndefined();

    // A repeated hello (initiator retry after a dropped ack) re-acks and
    // stays ready — no second resolution.
    hs.onMessage({ kind: "hello" });
    expect(posts).toEqual([{ kind: "ack" }, { kind: "ack" }]);
    expect(hs.isReady()).toBe(true);
  });
});

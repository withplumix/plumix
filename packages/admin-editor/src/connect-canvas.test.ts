import { describe, expect, test, vi } from "vitest";

import type { BlockNode } from "@plumix/blocks";
import { EDITOR_BRIDGE_CHANNEL, encode } from "@plumix/blocks/renderer";

import { connectCanvas } from "./connect-canvas.js";
import { createEditorStore } from "./store.js";

const ORIGIN = "http://localhost:3000";

function fakeFrame(): { win: Window; posted: unknown[] } {
  const posted: unknown[] = [];
  const win = {
    postMessage: (data: unknown) => posted.push(data),
  } as unknown as Window;
  return { win, posted };
}

function fromCanvas(message: unknown, origin = ORIGIN): void {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: encode(EDITOR_BRIDGE_CHANNEL, message),
      origin,
    }),
  );
}

function hostMessages(posted: unknown[]): { type?: string; tree?: unknown }[] {
  return posted
    .map((p) => (p as { message?: { type?: string } }).message)
    .filter((m): m is { type?: string } => m != null && "type" in m);
}

describe("connectCanvas", () => {
  test("pushes the current tree when the canvas reports ready", () => {
    const tree: readonly BlockNode[] = [{ id: "a", name: "core/heading" }];
    const store = createEditorStore({ tree });
    const { win, posted } = fakeFrame();
    const conn = connectCanvas({ store, frameWindow: win, origin: ORIGIN });

    fromCanvas({ type: "canvas:ready" });

    const treeMsg = hostMessages(posted).find((m) => m.type === "host:tree");
    expect(treeMsg?.tree).toEqual(tree);
    conn.dispose();
  });

  test("a canvas:select message updates the store's active block", () => {
    const store = createEditorStore();
    const { win } = fakeFrame();
    const conn = connectCanvas({ store, frameWindow: win, origin: ORIGIN });

    fromCanvas({ type: "canvas:select", id: "x" });

    expect(store.getState().activeId).toBe("x");
    conn.dispose();
  });

  test("a canvas:wheel message is delivered to onWheel", () => {
    const store = createEditorStore();
    const { win } = fakeFrame();
    const onWheel = vi.fn();
    const conn = connectCanvas({
      store,
      frameWindow: win,
      origin: ORIGIN,
      onWheel,
    });

    fromCanvas({
      type: "canvas:wheel",
      deltaX: 1,
      deltaY: -8,
      zoomIntent: true,
      clientX: 50,
      clientY: 60,
    });

    expect(onWheel).toHaveBeenCalledWith({
      deltaX: 1,
      deltaY: -8,
      zoomIntent: true,
      clientX: 50,
      clientY: 60,
    });
    conn.dispose();
  });

  test("a canvas:key message is delivered to onKey", () => {
    const store = createEditorStore();
    const { win } = fakeFrame();
    const onKey = vi.fn();
    const conn = connectCanvas({
      store,
      frameWindow: win,
      origin: ORIGIN,
      onKey,
    });

    fromCanvas({
      type: "canvas:key",
      down: true,
      code: "Space",
      shiftKey: false,
    });

    expect(onKey).toHaveBeenCalledWith({
      down: true,
      code: "Space",
      shiftKey: false,
    });
    conn.dispose();
  });

  test("an additive canvas:select extends the selection set", () => {
    const store = createEditorStore();
    const { win } = fakeFrame();
    const conn = connectCanvas({ store, frameWindow: win, origin: ORIGIN });

    fromCanvas({ type: "canvas:select", id: "x" });
    fromCanvas({ type: "canvas:select", id: "y", additive: true });

    expect([...store.getState().selectedIds].sort()).toEqual(["x", "y"]);
    expect(store.getState().activeId).toBe("y");
    conn.dispose();
  });

  test("re-pushes the tree when the store tree changes after ready", () => {
    const store = createEditorStore();
    const { win, posted } = fakeFrame();
    const conn = connectCanvas({ store, frameWindow: win, origin: ORIGIN });
    fromCanvas({ type: "canvas:ready" });
    posted.length = 0;

    const next: readonly BlockNode[] = [{ id: "b", name: "core/quote" }];
    store.getState().setTree(next);

    const treeMsg = hostMessages(posted).find((m) => m.type === "host:tree");
    expect(treeMsg?.tree).toEqual(next);
    conn.dispose();
  });

  test("pushLoaderData posts host:loader-data to the canvas", () => {
    const store = createEditorStore();
    const { win, posted } = fakeFrame();
    const conn = connectCanvas({ store, frameWindow: win, origin: ORIGIN });

    conn.pushLoaderData({ "blk-1": { posts: ["fresh"] } });

    const msg = posted
      .map(
        (p) => (p as { message?: { type?: string; data?: unknown } }).message,
      )
      .find((m) => m?.type === "host:loader-data");
    expect(msg?.data).toEqual({ "blk-1": { posts: ["fresh"] } });
    conn.dispose();
  });

  test("re-announces hello until the canvas acks, then stops", () => {
    vi.useFakeTimers();
    try {
      const store = createEditorStore();
      const { win, posted } = fakeFrame();
      const conn = connectCanvas({ store, frameWindow: win, origin: ORIGIN });
      const helloCount = (): number =>
        posted.filter(
          (p) =>
            (p as { message?: { kind?: string } }).message?.kind === "hello",
        ).length;

      expect(helloCount()).toBe(1); // sent once on connect
      vi.advanceTimersByTime(500);
      expect(helloCount()).toBeGreaterThan(1); // retried while waiting

      const afterAck = helloCount();
      fromCanvas({ kind: "ack" });
      vi.advanceTimersByTime(500);
      expect(helloCount()).toBe(afterAck); // stops once ready

      conn.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  test("ignores messages from a foreign origin", () => {
    const store = createEditorStore();
    const { win } = fakeFrame();
    const conn = connectCanvas({ store, frameWindow: win, origin: ORIGIN });

    fromCanvas({ type: "canvas:select", id: "evil" }, "http://evil.test");

    expect(store.getState().activeId).toBeNull();
    conn.dispose();
  });
});

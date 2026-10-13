import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { BlockNode } from "@plumix/core/blocks";
import { EDITOR_BRIDGE_CHANNEL, encode } from "@plumix/core/blocks/renderer";

import { treeBlocks } from "../test/tree-blocks.js";
import { connectCanvas } from "./connect-canvas.js";
import { createEditorStore } from "./store.js";

const ORIGIN = "http://localhost:3000";

/** Where the other half's messages arrive, in place of the window. */
let bus: EventTarget;

beforeEach(() => {
  bus = new EventTarget();
});

function fakeFrame(): { win: Window; posted: unknown[] } {
  const posted: unknown[] = [];
  const win = {
    postMessage: (data: unknown) => posted.push(data),
  } as unknown as Window;
  return { win, posted };
}

function fromCanvas(message: unknown, origin = ORIGIN): void {
  bus.dispatchEvent(
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
    const store = createEditorStore(treeBlocks, { tree });
    const { win, posted } = fakeFrame();
    const conn = connectCanvas({
      store,
      frameWindow: win,
      origin: ORIGIN,
      messageTarget: bus,
    });

    fromCanvas({ type: "canvas:ready" });

    const treeMsg = hostMessages(posted).find((m) => m.type === "host:tree");
    expect(treeMsg?.tree).toEqual(tree);
    conn.dispose();
  });

  test("a canvas:select message updates the store's active block", () => {
    const store = createEditorStore(treeBlocks);
    const { win } = fakeFrame();
    const conn = connectCanvas({
      store,
      frameWindow: win,
      origin: ORIGIN,
      messageTarget: bus,
    });

    fromCanvas({ type: "canvas:select", id: "x" });

    expect(store.getState().activeId).toBe("x");
    conn.dispose();
  });

  test("a canvas:wheel message is delivered to onWheel", () => {
    const store = createEditorStore(treeBlocks);
    const { win } = fakeFrame();
    const onWheel = vi.fn();
    const conn = connectCanvas({
      store,
      frameWindow: win,
      messageTarget: bus,
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
    const store = createEditorStore(treeBlocks);
    const { win } = fakeFrame();
    const onKey = vi.fn();
    const conn = connectCanvas({
      store,
      frameWindow: win,
      messageTarget: bus,
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

  test("a canvas:requestAdd message is delivered to onRequestAdd", () => {
    const store = createEditorStore(treeBlocks);
    const { win } = fakeFrame();
    const onRequestAdd = vi.fn();
    const conn = connectCanvas({
      store,
      frameWindow: win,
      messageTarget: bus,
      origin: ORIGIN,
      onRequestAdd,
    });

    fromCanvas({
      type: "canvas:requestAdd",
      parentId: "g1",
      slotKey: "content",
    });

    expect(onRequestAdd).toHaveBeenCalledWith({
      parentId: "g1",
      slotKey: "content",
    });
    conn.dispose();
  });

  test("pushes host:config to the canvas on ready when config is given", () => {
    const catalog = { "blocks.appender.addBlock": ["Ajouter un bloc"] };
    const store = createEditorStore(treeBlocks);
    const { win, posted } = fakeFrame();
    const conn = connectCanvas({
      store,
      frameWindow: win,
      messageTarget: bus,
      origin: ORIGIN,
      config: { locale: "fr", catalog },
    });

    fromCanvas({ type: "canvas:ready" });

    const configMsg = hostMessages(posted).find(
      (m) => m.type === "host:config",
    );
    expect(configMsg).toEqual({ type: "host:config", locale: "fr", catalog });
    conn.dispose();
  });

  test("sends no host:config when no config is given", () => {
    const store = createEditorStore(treeBlocks);
    const { win, posted } = fakeFrame();
    const conn = connectCanvas({
      store,
      frameWindow: win,
      origin: ORIGIN,
      messageTarget: bus,
    });

    fromCanvas({ type: "canvas:ready" });

    expect(hostMessages(posted).some((m) => m.type === "host:config")).toBe(
      false,
    );
    conn.dispose();
  });

  test("an additive canvas:select extends the selection set", () => {
    const store = createEditorStore(treeBlocks);
    const { win } = fakeFrame();
    const conn = connectCanvas({
      store,
      frameWindow: win,
      origin: ORIGIN,
      messageTarget: bus,
    });

    fromCanvas({ type: "canvas:select", id: "x" });
    fromCanvas({ type: "canvas:select", id: "y", additive: true });

    expect([...store.getState().selectedIds].sort()).toEqual(["x", "y"]);
    expect(store.getState().activeId).toBe("y");
    conn.dispose();
  });

  test("re-pushes the tree when the store tree changes after ready", () => {
    const store = createEditorStore(treeBlocks);
    const { win, posted } = fakeFrame();
    const conn = connectCanvas({
      store,
      frameWindow: win,
      origin: ORIGIN,
      messageTarget: bus,
    });
    fromCanvas({ type: "canvas:ready" });
    posted.length = 0;

    store.getState().insertBlock({ id: "b", name: "core/quote" }, 0);

    const treeMsg = hostMessages(posted).find((m) => m.type === "host:tree");
    expect(treeMsg?.tree).toEqual([{ id: "b", name: "core/quote" }]);
    conn.dispose();
  });

  test("pushLoaderData posts host:loader-data to the canvas", () => {
    const store = createEditorStore(treeBlocks);
    const { win, posted } = fakeFrame();
    const conn = connectCanvas({
      store,
      frameWindow: win,
      origin: ORIGIN,
      messageTarget: bus,
    });

    conn.pushLoaderData({ "blk-1": { posts: ["fresh"] } });

    const msg = posted
      .map(
        (p) => (p as { message?: { type?: string; data?: unknown } }).message,
      )
      .find((m) => m?.type === "host:loader-data");
    expect(msg?.data).toEqual({ "blk-1": { posts: ["fresh"] } });
    conn.dispose();
  });

  test("a canvas:requestDeps message is delivered to onRequestDeps", () => {
    const store = createEditorStore(treeBlocks);
    const { win } = fakeFrame();
    const onRequestDeps = vi.fn();
    const conn = connectCanvas({
      store,
      frameWindow: win,
      messageTarget: bus,
      origin: ORIGIN,
      onRequestDeps,
    });
    const tree: readonly BlockNode[] = [{ id: "n", name: "acme/nav" }];

    fromCanvas({ type: "canvas:requestDeps", tree });

    expect(onRequestDeps).toHaveBeenCalledWith(tree);
    conn.dispose();
  });

  test("pushDeps posts host:deps to the canvas", () => {
    const store = createEditorStore(treeBlocks);
    const { win, posted } = fakeFrame();
    const conn = connectCanvas({
      store,
      frameWindow: win,
      origin: ORIGIN,
      messageTarget: bus,
    });

    conn.pushDeps({ menus: { footer: "menu:footer" } });

    const msg = posted
      .map(
        (p) => (p as { message?: { type?: string; deps?: unknown } }).message,
      )
      .find((m) => m?.type === "host:deps");
    expect(msg?.deps).toEqual({ menus: { footer: "menu:footer" } });
    conn.dispose();
  });

  test("ignores messages from a foreign origin", () => {
    const store = createEditorStore(treeBlocks);
    const { win } = fakeFrame();
    const conn = connectCanvas({
      store,
      frameWindow: win,
      origin: ORIGIN,
      messageTarget: bus,
    });

    fromCanvas({ type: "canvas:select", id: "evil" }, "http://evil.test");

    expect(store.getState().activeId).toBeNull();
    conn.dispose();
  });
});

describe("connectCanvas hello retry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function helloCount(posted: unknown[]): number {
    return posted.filter(
      (p) => (p as { message?: { kind?: string } }).message?.kind === "hello",
    ).length;
  }

  test("re-announces hello every 250ms while the canvas has not acked", () => {
    const store = createEditorStore(treeBlocks);
    const { win, posted } = fakeFrame();
    const conn = connectCanvas({
      store,
      frameWindow: win,
      origin: ORIGIN,
      messageTarget: bus,
    });

    vi.advanceTimersByTime(500);

    expect(helloCount(posted)).toBe(3);
    conn.dispose();
  });

  test("stops re-announcing hello once the canvas acks", async () => {
    const store = createEditorStore(treeBlocks);
    const { win, posted } = fakeFrame();
    const conn = connectCanvas({
      store,
      frameWindow: win,
      origin: ORIGIN,
      messageTarget: bus,
    });
    fromCanvas({ kind: "ack" });

    await vi.advanceTimersByTimeAsync(1000);

    expect(helloCount(posted)).toBe(1);
    conn.dispose();
  });
});

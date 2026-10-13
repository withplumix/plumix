import { beforeEach, describe, expect, test } from "vitest";

import type { BlockNode, LoadedDeps } from "@plumix/core/blocks";
import type {
  CanvasConfig,
  SerializedLoaderData,
} from "@plumix/core/blocks/renderer";
import { EDITOR_BRIDGE_CHANNEL, encode } from "@plumix/core/blocks/renderer";

import { connectRuntime } from "./connect-runtime.js";

const ORIGIN = "http://localhost:3000";

/** Where the other half's messages arrive, in place of the window. */
let bus: EventTarget;

beforeEach(() => {
  bus = new EventTarget();
});

function fakeParent(): { win: Window; posted: unknown[] } {
  const posted: unknown[] = [];
  const win = {
    postMessage: (data: unknown) => posted.push(data),
  } as unknown as Window;
  return { win, posted };
}

function fromHost(message: unknown, origin = ORIGIN): void {
  bus.dispatchEvent(
    new MessageEvent("message", {
      data: encode(EDITOR_BRIDGE_CHANNEL, message),
      origin,
    }),
  );
}

function messages(posted: unknown[]): unknown[] {
  return posted.map((p) => (p as { message?: unknown }).message);
}

describe("connectRuntime (canvas/iframe side)", () => {
  test("acks the host's hello and re-announces readiness", () => {
    const { win, posted } = fakeParent();
    const conn = connectRuntime({
      parentWindow: win,
      messageTarget: bus,
      origin: ORIGIN,
      onTree: () => undefined,
    });

    fromHost({ kind: "hello" });

    expect(messages(posted)).toContainEqual({ kind: "ack" });
    expect(messages(posted)).toContainEqual({ type: "canvas:ready" });
    conn.dispose();
  });

  test("delivers a pushed tree to onTree", () => {
    const seen: (readonly BlockNode[])[] = [];
    const { win } = fakeParent();
    const conn = connectRuntime({
      parentWindow: win,
      messageTarget: bus,
      origin: ORIGIN,
      onTree: (tree) => seen.push(tree),
    });

    const tree: readonly BlockNode[] = [{ id: "a", name: "core/heading" }];
    fromHost({ type: "host:tree", tree });

    expect(seen.at(-1)).toEqual(tree);
    conn.dispose();
  });

  test("delivers a pushed loader-data map to onLoaderData", () => {
    const seen: SerializedLoaderData[] = [];
    const { win } = fakeParent();
    const conn = connectRuntime({
      parentWindow: win,
      messageTarget: bus,
      origin: ORIGIN,
      onTree: () => undefined,
      onLoaderData: (data) => seen.push(data),
    });

    const data = { "blk-1": { posts: ["fresh"] } };
    fromHost({ type: "host:loader-data", data });

    expect(seen.at(-1)).toEqual(data);
    conn.dispose();
  });

  test("delivers pushed deps to onDeps", () => {
    const seen: LoadedDeps[] = [];
    const { win } = fakeParent();
    const conn = connectRuntime({
      parentWindow: win,
      messageTarget: bus,
      origin: ORIGIN,
      onTree: () => undefined,
      onDeps: (deps) => seen.push(deps),
    });

    const deps = { menus: { footer: "menu:footer" } };
    fromHost({ type: "host:deps", deps });

    expect(seen.at(-1)).toEqual(deps);
    conn.dispose();
  });

  test("reportRequestDeps posts canvas:requestDeps with the tree", () => {
    const { win, posted } = fakeParent();
    const conn = connectRuntime({
      parentWindow: win,
      messageTarget: bus,
      origin: ORIGIN,
      onTree: () => undefined,
    });
    const tree: readonly BlockNode[] = [{ id: "n", name: "acme/nav" }];

    conn.reportRequestDeps(tree);

    expect(messages(posted)).toContainEqual({
      type: "canvas:requestDeps",
      tree,
    });
    conn.dispose();
  });

  test("reportSelect posts canvas:select to the host", () => {
    const { win, posted } = fakeParent();
    const conn = connectRuntime({
      parentWindow: win,
      messageTarget: bus,
      origin: ORIGIN,
      onTree: () => undefined,
    });

    conn.reportSelect("blk-1");

    expect(messages(posted)).toContainEqual({
      type: "canvas:select",
      id: "blk-1",
    });
    conn.dispose();
  });

  test("reportWheel posts canvas:wheel to the host", () => {
    const { win, posted } = fakeParent();
    const conn = connectRuntime({
      parentWindow: win,
      messageTarget: bus,
      origin: ORIGIN,
      onTree: () => undefined,
    });

    conn.reportWheel(4, -12, true, 100, 200);

    expect(messages(posted)).toContainEqual({
      type: "canvas:wheel",
      deltaX: 4,
      deltaY: -12,
      zoomIntent: true,
      clientX: 100,
      clientY: 200,
    });
    conn.dispose();
  });

  test("reportKey posts canvas:key to the host", () => {
    const { win, posted } = fakeParent();
    const conn = connectRuntime({
      parentWindow: win,
      messageTarget: bus,
      origin: ORIGIN,
      onTree: () => undefined,
    });

    conn.reportKey(true, "Space", false);

    expect(messages(posted)).toContainEqual({
      type: "canvas:key",
      down: true,
      code: "Space",
      shiftKey: false,
    });
    conn.dispose();
  });

  test("delivers a pushed host:config to onConfig", () => {
    const seen: CanvasConfig[] = [];
    const { win } = fakeParent();
    const conn = connectRuntime({
      parentWindow: win,
      messageTarget: bus,
      origin: ORIGIN,
      onTree: () => undefined,
      onConfig: (config) => seen.push(config),
    });

    const catalog = { "blocks.appender.addBlock": ["Ajouter un bloc"] };
    fromHost({ type: "host:config", locale: "fr", catalog });

    expect(seen.at(-1)).toEqual({ locale: "fr", catalog });
    conn.dispose();
  });

  test("reportRequestAdd posts canvas:requestAdd with the slot to the host", () => {
    const { win, posted } = fakeParent();
    const conn = connectRuntime({
      parentWindow: win,
      messageTarget: bus,
      origin: ORIGIN,
      onTree: () => undefined,
    });

    conn.reportRequestAdd("g1", "content");

    expect(messages(posted)).toContainEqual({
      type: "canvas:requestAdd",
      parentId: "g1",
      slotKey: "content",
    });
    conn.dispose();
  });

  test("a root reportRequestAdd posts canvas:requestAdd with no slot", () => {
    const { win, posted } = fakeParent();
    const conn = connectRuntime({
      parentWindow: win,
      messageTarget: bus,
      origin: ORIGIN,
      onTree: () => undefined,
    });

    conn.reportRequestAdd();

    expect(messages(posted)).toContainEqual({ type: "canvas:requestAdd" });
    conn.dispose();
  });

  test("ignores host messages from a foreign origin", () => {
    const seen: (readonly BlockNode[])[] = [];
    const { win } = fakeParent();
    const conn = connectRuntime({
      parentWindow: win,
      messageTarget: bus,
      origin: ORIGIN,
      onTree: (tree) => seen.push(tree),
    });

    fromHost(
      { type: "host:tree", tree: [{ id: "x", name: "core/heading" }] },
      "http://evil.test",
    );

    expect(seen).toHaveLength(0);
    conn.dispose();
  });
});

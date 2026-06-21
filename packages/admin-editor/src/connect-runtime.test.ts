import { describe, expect, test } from "vitest";

import type { BlockNode } from "@plumix/blocks";
import type { SerializedLoaderData } from "@plumix/blocks/renderer";
import { EDITOR_BRIDGE_CHANNEL, encode } from "@plumix/blocks/renderer";

import { connectRuntime } from "./connect-runtime.js";

const ORIGIN = "http://localhost:3000";

function fakeParent(): { win: Window; posted: unknown[] } {
  const posted: unknown[] = [];
  const win = {
    postMessage: (data: unknown) => posted.push(data),
  } as unknown as Window;
  return { win, posted };
}

function fromHost(message: unknown, origin = ORIGIN): void {
  window.dispatchEvent(
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
      origin: ORIGIN,
      onTree: () => undefined,
      onLoaderData: (data) => seen.push(data),
    });

    const data = { "blk-1": { posts: ["fresh"] } };
    fromHost({ type: "host:loader-data", data });

    expect(seen.at(-1)).toEqual(data);
    conn.dispose();
  });

  test("reportSelect posts canvas:select to the host", () => {
    const { win, posted } = fakeParent();
    const conn = connectRuntime({
      parentWindow: win,
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

  test("ignores host messages from a foreign origin", () => {
    const seen: (readonly BlockNode[])[] = [];
    const { win } = fakeParent();
    const conn = connectRuntime({
      parentWindow: win,
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

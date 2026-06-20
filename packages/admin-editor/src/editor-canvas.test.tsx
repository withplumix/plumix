import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { BlockNode } from "@plumix/blocks";
import { coreBlocks, createBlockRegistry } from "@plumix/blocks";
import { EDITOR_BRIDGE_CHANNEL, encode } from "@plumix/blocks/renderer";

import { EditorCanvas } from "./editor-canvas.js";

const registry = createBlockRegistry(coreBlocks);
const ORIGIN = "http://localhost:3000";

afterEach(cleanup);

function pushTree(tree: readonly BlockNode[]): void {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: encode(EDITOR_BRIDGE_CHANNEL, { type: "host:tree", tree }),
        origin: ORIGIN,
      }),
    );
  });
}

describe("EditorCanvas", () => {
  test("renders the host's tree in edit mode, tagging blocks for selection", () => {
    const { container } = render(
      <EditorCanvas registry={registry} origin={ORIGIN} />,
    );

    pushTree([
      { id: "h1", name: "core/heading", attrs: { text: "Hi", level: 2 } },
    ]);

    expect(container.querySelector('[data-plumix-id="h1"]')).not.toBeNull();
    expect(container.textContent).toContain("Hi");
  });

  test("clicking a block reports canvas:select to the host", () => {
    const posted: unknown[] = [];
    const spy = vi
      .spyOn(window.parent, "postMessage")
      .mockImplementation((data) => posted.push(data));

    const { container } = render(
      <EditorCanvas registry={registry} origin={ORIGIN} />,
    );
    pushTree([{ id: "h1", name: "core/heading", attrs: { text: "Hi" } }]);

    const block = container.querySelector('[data-plumix-id="h1"]');
    expect(block).not.toBeNull();
    if (block) fireEvent.click(block);

    const select = posted
      .map((p) => (p as { message?: { type?: string } }).message)
      .find((m) => m?.type === "canvas:select");
    expect(select).toEqual({ type: "canvas:select", id: "h1" });
    spy.mockRestore();
  });

  test("hovering a block reports canvas:hover to the host", () => {
    const posted: unknown[] = [];
    const spy = vi
      .spyOn(window.parent, "postMessage")
      .mockImplementation((data) => posted.push(data));

    const { container } = render(
      <EditorCanvas registry={registry} origin={ORIGIN} />,
    );
    pushTree([{ id: "h1", name: "core/heading", attrs: { text: "Hi" } }]);

    const block = container.querySelector('[data-plumix-id="h1"]');
    expect(block).not.toBeNull();
    if (block) fireEvent.mouseOver(block);

    const hover = posted
      .map((p) => (p as { message?: { type?: string } }).message)
      .find((m) => m?.type === "canvas:hover");
    expect(hover).toEqual({ type: "canvas:hover", id: "h1" });
    spy.mockRestore();
  });
});

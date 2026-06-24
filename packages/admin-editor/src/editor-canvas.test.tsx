import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { BlockNode, ThemeTokens } from "@plumix/blocks";
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

  test("shift-clicking a block reports an additive canvas:select", () => {
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
    if (block) fireEvent.click(block, { shiftKey: true });

    const select = posted
      .map((p) => (p as { message?: { type?: string } }).message)
      .find((m) => m?.type === "canvas:select");
    expect(select).toEqual({
      type: "canvas:select",
      id: "h1",
      additive: true,
    });
    spy.mockRestore();
  });

  test("reports container slot regions for nested drop targeting", () => {
    const posted: unknown[] = [];
    const spy = vi
      .spyOn(window.parent, "postMessage")
      .mockImplementation((data) => posted.push(data));

    render(<EditorCanvas registry={registry} origin={ORIGIN} />);
    pushTree([
      {
        id: "g1",
        name: "core/group",
        attrs: {
          content: [{ id: "h1", name: "core/heading", attrs: { text: "Hi" } }],
        },
      },
    ]);

    const geometry = posted
      .map((p) => (p as { message?: { type?: string } }).message)
      .find((m) => m?.type === "canvas:geometry") as
      | { slots?: { parentId: string; slotKey: string }[] }
      | undefined;
    expect(
      geometry?.slots?.some(
        (s) => s.parentId === "g1" && s.slotKey === "content",
      ),
    ).toBe(true);
    spy.mockRestore();
  });

  test("renders an initial tree immediately, before any host push", () => {
    const { container } = render(
      <EditorCanvas
        registry={registry}
        origin={ORIGIN}
        initialTree={[
          {
            id: "seed",
            name: "core/heading",
            attrs: { text: "Seeded", level: 2 },
          },
        ]}
      />,
    );

    expect(container.querySelector('[data-plumix-id="seed"]')).not.toBeNull();
    expect(container.textContent).toContain("Seeded");
  });

  test("applies a block's style as emitted CSS when tokens are provided", () => {
    const tokens: ThemeTokens = { colors: { brand: { value: "#0000ff" } } };
    const { container } = render(
      <EditorCanvas registry={registry} origin={ORIGIN} tokens={tokens} />,
    );

    // A style edit (here a custom text color) is pushed with the tree. The
    // renderer only emits the per-block `<style>` when it has tokens; without
    // them the edit is stored but never painted in the canvas.
    pushTree([
      {
        id: "h1",
        name: "core/heading",
        attrs: { text: "Hi", level: 2 },
        style: { large: { color: { raw: "#ff0000" } } },
      },
    ]);

    const css = [...container.querySelectorAll("style")]
      .map((s) => s.textContent)
      .join(" ");
    expect(css).toContain("plumix-block-h1");
    expect(css).toContain("#ff0000");
  });

  test("empty document renders the add affordance; clicking it reports requestAdd", () => {
    const posted: unknown[] = [];
    const spy = vi
      .spyOn(window.parent, "postMessage")
      .mockImplementation((data) => posted.push(data));

    // No tree pushed → empty document → the in-canvas "Add a block" appender.
    const { container } = render(
      <EditorCanvas registry={registry} origin={ORIGIN} />,
    );
    const add = container.querySelector("[data-plumix-add]");
    expect(add).not.toBeNull();
    if (add) fireEvent.click(add);

    const req = posted
      .map((p) => (p as { message?: { type?: string } }).message)
      .find((m) => m?.type === "canvas:requestAdd");
    expect(req).toEqual({ type: "canvas:requestAdd" });
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

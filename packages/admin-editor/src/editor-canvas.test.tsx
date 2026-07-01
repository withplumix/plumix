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
      { id: "h1", name: "core/rich-text", attrs: { body: "<h2>Hi</h2>" } },
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
    pushTree([
      { id: "h1", name: "core/rich-text", attrs: { body: "<h2>Hi</h2>" } },
    ]);

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
    pushTree([
      { id: "h1", name: "core/rich-text", attrs: { body: "<h2>Hi</h2>" } },
    ]);

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
          content: [
            {
              id: "h1",
              name: "core/rich-text",
              attrs: { body: "<h2>Hi</h2>" },
            },
          ],
        },
      },
    ]);

    const geometry = posted
      .map((p) => (p as { message?: { type?: string } }).message)
      .find((m) => m?.type === "canvas:geometry") as
      { slots?: { parentId: string; slotKey: string }[] } | undefined;
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
            name: "core/rich-text",
            attrs: { body: "<h2>Seeded</h2>" },
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

    // A style edit (here a custom text color) is pushed with the tree; the
    // renderer emits the per-block `<style>` from the stored value string.
    pushTree([
      {
        id: "h1",
        name: "core/rich-text",
        attrs: { body: "<h2>Hi</h2>" },
        style: { large: { color: "#ff0000" } },
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

  test("applies the host's pushed config label to the add affordance", () => {
    const { container } = render(
      <EditorCanvas registry={registry} origin={ORIGIN} />,
    );

    // Before config arrives, the appender falls back to English.
    expect(container.querySelector("[data-plumix-add]")?.textContent).toBe(
      "Add a block",
    );

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: encode(EDITOR_BRIDGE_CHANNEL, {
            type: "host:config",
            addBlockLabel: "Ajouter un bloc",
          }),
          origin: ORIGIN,
        }),
      );
    });

    expect(container.querySelector("[data-plumix-add]")?.textContent).toBe(
      "Ajouter un bloc",
    );
  });

  test("hovering a block reports canvas:hover to the host", () => {
    const posted: unknown[] = [];
    const spy = vi
      .spyOn(window.parent, "postMessage")
      .mockImplementation((data) => posted.push(data));

    const { container } = render(
      <EditorCanvas registry={registry} origin={ORIGIN} />,
    );
    pushTree([
      { id: "h1", name: "core/rich-text", attrs: { body: "<h2>Hi</h2>" } },
    ]);

    const block = container.querySelector('[data-plumix-id="h1"]');
    expect(block).not.toBeNull();
    if (block) fireEvent.mouseOver(block);

    const hover = posted
      .map((p) => (p as { message?: { type?: string } }).message)
      .find((m) => m?.type === "canvas:hover");
    expect(hover).toEqual({ type: "canvas:hover", id: "h1" });
    spy.mockRestore();
  });

  test("a link click in the canvas is prevented from navigating", () => {
    const { container } = render(
      <EditorCanvas registry={registry} origin={ORIGIN} />,
    );
    const link = document.createElement("a");
    link.href = "/elsewhere";
    container.appendChild(link);

    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      link.dispatchEvent(event);
    });

    // The capture-phase guard kills navigation, leaving selection to bubble.
    expect(event.defaultPrevented).toBe(true);
  });

  test("a middle-click on a link is prevented (no new-tab navigation)", () => {
    const { container } = render(
      <EditorCanvas registry={registry} origin={ORIGIN} />,
    );
    const link = document.createElement("a");
    link.href = "/elsewhere";
    container.appendChild(link);

    const event = new MouseEvent("auxclick", {
      bubbles: true,
      cancelable: true,
      button: 1,
    });
    act(() => {
      link.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
  });

  test("a form submit in the canvas is prevented", () => {
    const { container } = render(
      <EditorCanvas registry={registry} origin={ORIGIN} />,
    );
    const form = document.createElement("form");
    container.appendChild(form);

    const event = new Event("submit", { bubbles: true, cancelable: true });
    act(() => {
      form.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
  });

  test("theme chrome around the content root is made inert, content stays live", () => {
    const { getByTestId } = render(
      <div>
        <header data-testid="chrome-header">
          <a href="/x">Home</a>
        </header>
        <div data-plumix-content-root>
          <EditorCanvas registry={registry} origin={ORIGIN} />
        </div>
        <footer data-testid="chrome-footer" />
      </div>,
    );

    expect(getByTestId("chrome-header").hasAttribute("inert")).toBe(true);
    expect(
      getByTestId("chrome-header").hasAttribute("data-plumix-chrome"),
    ).toBe(true);
    expect(getByTestId("chrome-footer").hasAttribute("inert")).toBe(true);
    // The editable content root is left interactive.
    expect(getByTestId("plumix-editor-canvas").hasAttribute("inert")).toBe(
      false,
    );
  });
});

// @vitest-environment jsdom
/// <reference lib="dom" />
import type { ReactElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { DevOverlayShell } from "./overlay-shell.js";

// React roots render on the scheduler; give it a macrotask to flush before
// reading the DOM. Mirrors the island/compile overlay suites' teardown.
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

let container: HTMLElement;
let root: Root;

function query(testid: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
}

async function mount(node: ReactElement): Promise<void> {
  root.render(node);
  await tick();
}

describe("DevOverlayShell", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    root.unmount();
    container.remove();
    await tick();
  });

  test("renders the label, an aria-labeled dialog, and its body children", async () => {
    await mount(
      <DevOverlayShell
        label="Counter"
        ariaLabel="Client error"
        onClose={vi.fn()}
      >
        <p data-testid="body-content">the error</p>
      </DevOverlayShell>,
    );

    const panel = query("plumix-dev-overlay-panel");
    expect(panel?.getAttribute("role")).toBe("dialog");
    expect(panel?.getAttribute("aria-label")).toBe("Client error");
    expect(query("plumix-dev-overlay-label")?.textContent).toBe("Counter");
    expect(query("body-content")?.textContent).toBe("the error");
  });

  test("renders bar actions between the label and the close button", async () => {
    await mount(
      <DevOverlayShell
        label="Counter"
        ariaLabel="Client error"
        onClose={vi.fn()}
        actions={<span data-testid="bar-actions">nav</span>}
      >
        <p>body</p>
      </DevOverlayShell>,
    );

    expect(query("bar-actions")?.textContent).toBe("nav");
  });

  test("calls onClose when the close button is pressed", async () => {
    const onClose = vi.fn();
    await mount(
      <DevOverlayShell
        label="Counter"
        ariaLabel="Client error"
        onClose={onClose}
      >
        <p>body</p>
      </DevOverlayShell>,
    );

    query("plumix-dev-overlay-close")?.click();
    await tick();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("closes on a backdrop press-and-release", async () => {
    const onClose = vi.fn();
    await mount(
      <DevOverlayShell
        label="Counter"
        ariaLabel="Client error"
        onClose={onClose}
      >
        <p>body</p>
      </DevOverlayShell>,
    );

    const backdrop = query("plumix-dev-overlay-backdrop");
    backdrop?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("stays open when a drag starts in the modal and ends on the backdrop", async () => {
    const onClose = vi.fn();
    await mount(
      <DevOverlayShell
        label="Counter"
        ariaLabel="Client error"
        onClose={onClose}
      >
        <p>body</p>
      </DevOverlayShell>,
    );

    // Press begins inside the modal (a text selection), released on backdrop.
    query("plumix-dev-overlay-panel")?.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true }),
    );
    query("plumix-dev-overlay-backdrop")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await tick();
    expect(onClose).not.toHaveBeenCalled();
  });
});

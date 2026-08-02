// @vitest-environment jsdom
/// <reference lib="dom" />
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import type { HmrClient, ViteErrorPayload } from "./compile-overlay.js";
import {
  compileErrorToInfo,
  installCompileErrorOverlay,
} from "./compile-overlay.js";

const HOST_TAG = "plumix-compile-error-overlay";

// A minimal `import.meta.hot` stand-in that records subscriptions and lets a
// test drive `vite:error` / lifecycle events synchronously.
class FakeHot implements HmrClient {
  private readonly handlers = new Map<
    string,
    Set<(payload?: { err?: ViteErrorPayload }) => void>
  >();

  on(event: string, cb: (payload?: { err?: ViteErrorPayload }) => void): void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(cb);
  }

  off(event: string, cb: (payload?: { err?: ViteErrorPayload }) => void): void {
    this.handlers.get(event)?.delete(cb);
  }

  emit(event: string, payload?: { err?: ViteErrorPayload }): void {
    for (const cb of this.handlers.get(event) ?? []) cb(payload);
  }

  count(event: string): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}

// React roots inside the shadow render on the scheduler; give it a macrotask to
// flush before reading the DOM. Mirrors the island-overlay suite's teardown.
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function host(): HTMLElement | null {
  return document.querySelector<HTMLElement>(HOST_TAG);
}

function query(testid: string): HTMLElement | null {
  const shadow = host()?.shadowRoot;
  return (
    shadow?.querySelector<HTMLElement>(`[data-testid="${testid}"]`) ?? null
  );
}

function viteError(err: ViteErrorPayload): { err: ViteErrorPayload } {
  return { err };
}

describe("compileErrorToInfo", () => {
  test("maps message, plugin, location, and frame into DevErrorInfo", () => {
    const info = compileErrorToInfo({
      message: "Expected ';' but found 'const'",
      plugin: "vite:import-analysis",
      frame: "10 |  const x = 1\n   |  ^",
      loc: { file: "/proj/src/Counter.tsx", line: 10, column: 2 },
    });
    expect(info.name).toBe("Compile error · vite:import-analysis");
    expect(info.message).toBe("Expected ';' but found 'const'");
    expect(info.stack).toContain("/proj/src/Counter.tsx:10:2");
    expect(info.stack).toContain("const x = 1");
  });

  test("uses only the first line of a multi-line message as the header", () => {
    const info = compileErrorToInfo({
      message: "Transform failed with 1 error:\ndetail line\nmore detail",
    });
    expect(info.message).toBe("Transform failed with 1 error:");
    expect(info.name).toBe("Compile error");
  });

  test("falls back to the JS stack when no code frame is present", () => {
    const info = compileErrorToInfo({
      message: "Boom",
      stack: "Error: Boom\n    at load (x.ts:1:1)",
    });
    expect(info.stack).toContain("at load (x.ts:1:1)");
  });

  test("degrades to a bare name and message with no detail", () => {
    const info = compileErrorToInfo({ message: "Boom" });
    expect(info).toEqual({ name: "Compile error", message: "Boom" });
  });
});

describe("installCompileErrorOverlay", () => {
  let hot: FakeHot;
  let uninstall: () => void = () => undefined;

  beforeEach(() => {
    document.body.innerHTML = "";
    hot = new FakeHot();
    uninstall = installCompileErrorOverlay(hot);
  });

  afterEach(async () => {
    uninstall();
    uninstall = () => undefined;
    document.body.innerHTML = "";
    await tick();
  });

  test("stays out of the DOM until a compile error arrives", () => {
    expect(host()).toBeNull();
  });

  test("renders the shared error page in a modal on vite:error", async () => {
    hot.emit(
      "vite:error",
      viteError({
        message: "Unexpected token",
        frame: "1 | const =\n  |       ^",
        loc: { file: "/proj/src/App.tsx", line: 1, column: 8 },
      }),
    );
    await tick();

    expect(query("plumix-dev-overlay-panel")).not.toBeNull();
    expect(query("plumix-dev-error-message")?.textContent).toBe(
      "Unexpected token",
    );
    expect(query("plumix-dev-overlay-label")?.textContent).toBe(
      "Compile error",
    );
    // The Vite code frame is shown in the shared stack view.
    expect(query("plumix-dev-error-stack")?.textContent).toContain("const =");
  });

  test("clears the overlay when the module recompiles", async () => {
    hot.emit("vite:error", viteError({ message: "Broken" }));
    await tick();
    expect(host()).not.toBeNull();

    hot.emit("vite:beforeUpdate");
    await tick();
    expect(host()).toBeNull();
  });

  test("dismisses on the close button", async () => {
    hot.emit("vite:error", viteError({ message: "Broken" }));
    await tick();

    query("plumix-dev-overlay-close")?.click();
    await tick();
    expect(host()).toBeNull();
  });

  test("dismisses on Escape", async () => {
    hot.emit("vite:error", viteError({ message: "Broken" }));
    await tick();
    expect(host()).not.toBeNull();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await tick();
    expect(host()).toBeNull();
  });

  test("closes on a backdrop press-and-release", async () => {
    hot.emit("vite:error", viteError({ message: "Broken" }));
    await tick();

    const backdrop = query("plumix-dev-overlay-backdrop");
    backdrop?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();
    expect(host()).toBeNull();
  });

  test("stays open when a drag starts in the modal and ends on the backdrop", async () => {
    hot.emit("vite:error", viteError({ message: "Broken" }));
    await tick();

    query("plumix-dev-overlay-panel")?.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true }),
    );
    query("plumix-dev-overlay-backdrop")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await tick();
    expect(query("plumix-dev-overlay-panel")).not.toBeNull();
  });

  test("replaces the shown error when a newer compile error arrives", async () => {
    hot.emit("vite:error", viteError({ message: "First" }));
    await tick();
    expect(query("plumix-dev-error-message")?.textContent).toBe("First");

    hot.emit("vite:error", viteError({ message: "Second" }));
    await tick();
    expect(query("plumix-dev-error-message")?.textContent).toBe("Second");
  });

  test("is idempotent — a second install returns the same teardown", () => {
    const second = installCompileErrorOverlay(hot);
    // No duplicate subscription stacked on the shared hot client.
    expect(hot.count("vite:error")).toBe(1);
    expect(second).toBe(uninstall);
  });

  test("ignores a vite:error payload that carries no err", async () => {
    hot.emit("vite:error", undefined);
    hot.emit("vite:error", {});
    await tick();
    expect(host()).toBeNull();
  });

  test("re-shows after a dismissal when a new error arrives", async () => {
    hot.emit("vite:error", viteError({ message: "First" }));
    await tick();
    query("plumix-dev-overlay-close")?.click();
    await tick();
    expect(host()).toBeNull();

    // A fresh error must remount the overlay, not stay dismissed.
    hot.emit("vite:error", viteError({ message: "Second" }));
    await tick();
    expect(query("plumix-dev-error-message")?.textContent).toBe("Second");
  });

  test("replays an initialError buffered before install (cold-start race)", async () => {
    // A page loaded onto an already-broken module: Vite broadcast vite:error
    // before the lazily-imported overlay wired its listener, so the caller
    // buffered it and hands it in.
    uninstall();
    const fresh = new FakeHot();
    uninstall = installCompileErrorOverlay(fresh, {
      initialError: viteError({ message: "Already broken on load" }),
    });
    await tick();
    expect(query("plumix-dev-error-message")?.textContent).toBe(
      "Already broken on load",
    );
  });

  test("uninstall unsubscribes and stops capturing", async () => {
    uninstall();
    uninstall = () => undefined;
    expect(hot.count("vite:error")).toBe(0);

    hot.emit("vite:error", viteError({ message: "After" }));
    await tick();
    expect(host()).toBeNull();
  });
});

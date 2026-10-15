import { afterEach, describe, expect, test } from "vitest";

import type {
  CompileOverlayController,
  CompileOverlayView,
  HmrClient,
  ViteErrorPayload,
} from "./compile-overlay-controller.js";
import { createCompileOverlayController } from "./compile-overlay-controller.js";

type Handler = (payload?: { err?: ViteErrorPayload }) => void;

/**
 * A minimal `import.meta.hot` stand-in that records subscriptions and lets a
 * test drive `vite:error` and the lifecycle events synchronously.
 */
class FakeHot implements HmrClient {
  private readonly handlers = new Map<string, Set<Handler>>();

  on(event: string, cb: Handler): void {
    const set = this.handlers.get(event) ?? new Set();
    set.add(cb);
    this.handlers.set(event, set);
  }

  off(event: string, cb: Handler): void {
    this.handlers.get(event)?.delete(cb);
  }

  emit(event: string, payload?: { err?: ViteErrorPayload }): void {
    for (const cb of this.handlers.get(event) ?? []) cb(payload);
  }

  count(event: string): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}

/** Records the error the overlay shows; `null` while it is hidden. */
class FakeView implements CompileOverlayView {
  shown: ViteErrorPayload | null = null;

  show(error: ViteErrorPayload): void {
    this.shown = error;
  }

  hide(): void {
    this.shown = null;
  }
}

let controller: CompileOverlayController | null = null;

function control(
  hot: HmrClient,
  view: CompileOverlayView,
  initialError?: { err?: ViteErrorPayload },
): CompileOverlayController {
  controller = createCompileOverlayController(hot, view, initialError);
  return controller;
}

afterEach(() => {
  controller?.teardown();
  controller = null;
});

describe("createCompileOverlayController", () => {
  test("shows nothing until a compile error arrives", () => {
    const view = new FakeView();

    control(new FakeHot(), view);

    expect(view.shown).toBeNull();
  });

  test("replaces the shown error when a newer compile error arrives", () => {
    const hot = new FakeHot();
    const view = new FakeView();
    control(hot, view);
    hot.emit("vite:error", { err: { message: "First" } });

    hot.emit("vite:error", { err: { message: "Second" } });

    expect(view.shown).toEqual({ message: "Second" });
  });

  test("a second controller on the same page reuses the first", () => {
    const hot = new FakeHot();
    const first = control(hot, new FakeView());

    const second = createCompileOverlayController(hot, new FakeView());

    expect(second).toBe(first);
    expect(hot.count("vite:error")).toBe(1);
  });

  test.each([undefined, {}])(
    "ignores a vite:error payload that carries no err (%o)",
    (payload) => {
      const hot = new FakeHot();
      const view = new FakeView();
      control(hot, view);

      hot.emit("vite:error", payload);

      expect(view.shown).toBeNull();
    },
  );

  test("shows a new error after the last one was dismissed", () => {
    const hot = new FakeHot();
    const view = new FakeView();
    const overlay = control(hot, view);
    hot.emit("vite:error", { err: { message: "First" } });
    overlay.dismiss();

    hot.emit("vite:error", { err: { message: "Second" } });

    expect(view.shown).toEqual({ message: "Second" });
  });

  test("shows an error buffered before it subscribed", () => {
    const view = new FakeView();

    control(new FakeHot(), view, {
      err: { message: "Already broken on load" },
    });

    expect(view.shown).toEqual({ message: "Already broken on load" });
  });

  test("teardown unsubscribes, so a later error shows nothing", () => {
    const hot = new FakeHot();
    const view = new FakeView();
    control(hot, view).teardown();

    hot.emit("vite:error", { err: { message: "After" } });

    expect(hot.count("vite:error")).toBe(0);
    expect(view.shown).toBeNull();
  });
});

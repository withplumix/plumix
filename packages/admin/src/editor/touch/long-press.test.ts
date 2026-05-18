import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { attachLongPressHandler } from "./long-press.js";

function dispatchTouch(
  target: HTMLElement,
  type: "touchstart" | "touchmove" | "touchend" | "touchcancel",
  touches: readonly { clientX: number; clientY: number }[],
): void {
  // jsdom lacks a usable TouchEvent constructor — synthesise a plain
  // Event and graft the `touches` shape the handler reads. dispatching
  // through the real EventTarget keeps the listener wiring exercised.
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "touches", { value: touches });
  target.dispatchEvent(event);
}

describe("attachLongPressHandler", () => {
  let target: HTMLElement;
  let onLongPress: ReturnType<typeof vi.fn<() => void>>;
  let detach: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    target = document.createElement("div");
    document.body.appendChild(target);
    onLongPress = vi.fn<() => void>();
    detach = attachLongPressHandler(target, onLongPress);
  });

  afterEach(() => {
    detach();
    target.remove();
    vi.useRealTimers();
  });

  test("fires onLongPress after the threshold elapses without movement", () => {
    dispatchTouch(target, "touchstart", [{ clientX: 50, clientY: 50 }]);
    vi.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  test("does not fire on a quick tap (touchend before threshold)", () => {
    dispatchTouch(target, "touchstart", [{ clientX: 50, clientY: 50 }]);
    vi.advanceTimersByTime(200);
    dispatchTouch(target, "touchend", []);
    vi.advanceTimersByTime(500);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  test("cancels when the finger moves beyond the slop threshold", () => {
    dispatchTouch(target, "touchstart", [{ clientX: 50, clientY: 50 }]);
    vi.advanceTimersByTime(100);
    dispatchTouch(target, "touchmove", [{ clientX: 80, clientY: 50 }]);
    vi.advanceTimersByTime(500);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  test("tolerates small movement inside the slop threshold", () => {
    dispatchTouch(target, "touchstart", [{ clientX: 50, clientY: 50 }]);
    vi.advanceTimersByTime(100);
    dispatchTouch(target, "touchmove", [{ clientX: 52, clientY: 51 }]);
    vi.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  test("touchcancel aborts the long-press timer", () => {
    dispatchTouch(target, "touchstart", [{ clientX: 50, clientY: 50 }]);
    vi.advanceTimersByTime(100);
    dispatchTouch(target, "touchcancel", []);
    vi.advanceTimersByTime(500);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  test("detach removes the listeners and disarms pending timers", () => {
    dispatchTouch(target, "touchstart", [{ clientX: 50, clientY: 50 }]);
    vi.advanceTimersByTime(100);
    detach();
    vi.advanceTimersByTime(500);
    expect(onLongPress).not.toHaveBeenCalled();
  });
});

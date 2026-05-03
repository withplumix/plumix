import "@testing-library/jest-dom/vitest";

// jsdom doesn't ship `ResizeObserver`; radix primitives that measure
// thumbs / triggers (Slider, Tooltip, etc.) call it during layout
// effects and crash without a stub. The shim is enough for tests
// that don't actually assert on resize behaviour.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe(): void {
      /* no-op */
    }
    unobserve(): void {
      /* no-op */
    }
    disconnect(): void {
      /* no-op */
    }
  };
}

// Shared jsdom stubs for the browser APIs that Radix UI primitives (Select,
// RadioGroup, etc.) reach for when opened under test. jsdom omits them, so a
// Radix trigger crashes on `pointerdown` (or never opens) without these.
// Import this as a vitest setup file in any package that drives Radix UI via
// @testing-library/user-event: `import "@plumix/vitest-config/jsdom-radix";`.

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

// cmdk + Radix scroll the active item into view during keyboard navigation.
Element.prototype.scrollIntoView = function scrollIntoView(): void {
  /* no-op */
};

// Radix calls the PointerEvent capture API on `pointerdown`.
const elementProto = Element.prototype as unknown as {
  hasPointerCapture?: (id: number) => boolean;
  setPointerCapture?: (id: number) => void;
  releasePointerCapture?: (id: number) => void;
};
elementProto.hasPointerCapture = (): boolean => false;
elementProto.setPointerCapture = (): void => undefined;
elementProto.releasePointerCapture = (): void => undefined;

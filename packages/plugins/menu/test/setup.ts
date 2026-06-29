import "@testing-library/jest-dom/vitest";

import { vi } from "vitest";

// jsdom lacks the APIs Radix primitives (Select trigger, etc.) touch when
// opened under test. Stub them so the shadcn Select is drivable via
// @testing-library/user-event.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
}

Element.prototype.scrollIntoView = function scrollIntoView(): void {
  /* no-op */
};

const elementProto = Element.prototype as unknown as {
  hasPointerCapture?: (id: number) => boolean;
  setPointerCapture?: (id: number) => void;
  releasePointerCapture?: (id: number) => void;
};
elementProto.hasPointerCapture = (): boolean => false;
elementProto.setPointerCapture = (): void => undefined;
elementProto.releasePointerCapture = (): void => undefined;

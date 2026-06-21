import { vi } from "vitest";

// jsdom has no matchMedia, but the shadcn Sidebar's useIsMobile hook calls it.
// Stub a desktop-width result so the editor's rails render their desktop branch
// under test. (TS types matchMedia as always present, so assign unconditionally
// rather than guard — jsdom never provides one.)
window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

// jsdom has no ResizeObserver, but cmdk (the shadcn Command inserter) and the
// canvas frame's measure-on-resize both construct one. A no-op stub keeps them
// mountable under test.
class ResizeObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
globalThis.ResizeObserver = ResizeObserverStub;

// jsdom omits Element.scrollIntoView; cmdk calls it on the active CommandItem
// during keyboard navigation. Stub so the inserter doesn't crash under test.
Element.prototype.scrollIntoView = function scrollIntoView(): void {
  /* no-op */
};

// jsdom omits the PointerEvent capture API; Radix primitives call it on
// pointerdown and crash without it.
const elementProto = Element.prototype as unknown as {
  hasPointerCapture?: (id: number) => boolean;
  setPointerCapture?: (id: number) => void;
  releasePointerCapture?: (id: number) => void;
};
elementProto.hasPointerCapture = (): boolean => false;
elementProto.setPointerCapture = (): void => undefined;
elementProto.releasePointerCapture = (): void => undefined;

import { vi } from "vitest";

// Shared jsdom stubs for the APIs Radix UI primitives touch (ResizeObserver,
// scrollIntoView, PointerEvent capture). The editor-specific stubs below cover
// what's unique to this package.
import "@plumix/vitest-config/jsdom-radix";

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

// jsdom's Range omits getClientRects; ProseMirror calls it to measure the
// caret when the rich-text editor takes focus (e.g. after a format change
// driven through the toolbar). Return an empty list so coordinate lookups
// no-op instead of throwing an unhandled error.
const rangeProto = Range.prototype as unknown as {
  getClientRects?: () => DOMRect[];
  getBoundingClientRect?: () => DOMRect;
};
rangeProto.getClientRects = (): DOMRect[] => [];
rangeProto.getBoundingClientRect = (): DOMRect =>
  ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
  }) as DOMRect;

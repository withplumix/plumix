import "@testing-library/jest-dom/vitest";
import "@plumix/vitest-config/jsdom-radix";

// jsdom omits `matchMedia` and Range measurement, which CodeMirror (the JSON
// metabox field) calls on mount. Both are layout queries with no meaning in a
// headless DOM, so answering "no match" / "no rectangles" is the honest stub.
window.matchMedia = (query: string): MediaQueryList =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;

// jsdom has no viewport, so the router's post-navigation scroll is a no-op it
// otherwise reports as an unimplemented method on every navigation.
window.scrollTo = (): void => undefined;

Range.prototype.getClientRects = (): DOMRectList =>
  Object.assign([], { item: () => null });
Range.prototype.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 0, 0);

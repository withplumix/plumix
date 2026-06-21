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

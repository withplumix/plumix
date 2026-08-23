interface Vi {
  readonly mock: (path: string, factory?: () => unknown) => void;
  readonly doMock: (path: string, factory?: () => unknown) => void;
  readonly unmock: (path: string) => void;
  readonly doUnmock: (path: string) => void;
  readonly importActual: (path: string) => Promise<unknown>;
  readonly importMock: (path: string) => Promise<unknown>;
  readonly fn: () => () => void;
  readonly hoisted: <T>(factory: () => T) => T;
}

declare const vi: Vi;

vi.mock("../lib/toast.js", () => ({ toastError: vi.fn() }));

vi.doMock("../lib/toast.js");

vi.unmock("../lib/toast.js");

vi.doUnmock("../lib/toast.js");

export const actual = vi.importActual("../lib/toast.js");

export const mocked = vi.importMock("../lib/toast.js");

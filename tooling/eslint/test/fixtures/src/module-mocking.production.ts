interface Vi {
  readonly mock: (path: string) => void;
}

declare const vi: Vi;

// The rule is the inverse of the earned-types set: test files only, because
// that is the only place the pattern occurs.
vi.mock("../lib/toast.js");

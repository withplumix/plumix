interface Vi {
  readonly fn: <TArgs extends unknown[], TResult>(
    impl?: (...args: TArgs) => TResult,
  ) => (...args: TArgs) => TResult;
  readonly spyOn: <TObject, TKey extends keyof TObject>(
    object: TObject,
    key: TKey,
  ) => TObject[TKey];
  readonly stubGlobal: (name: string, value: unknown) => void;
  readonly mocked: <T>(value: T) => T;
}

declare const vi: Vi;

// Substituting a real seam — a callback, a global, an object property — is
// the point of the rule, not something it objects to.
export const onSave = vi.fn((value: string) => value.length);

export const clock = vi.spyOn(globalThis, "setTimeout");

vi.stubGlobal(
  "fetch",
  vi.fn(() => new Response()),
);

export const typedSpy = vi.mocked(onSave);

// A method named `mock` on something that isn't `vi` is unrelated.
declare const server: { readonly mock: (path: string) => void };
server.mock("/api/posts");

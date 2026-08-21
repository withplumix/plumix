// Weak collections key on identity, so `object` here is the constraint the
// runtime imposes rather than a shape nobody bothered to describe.
export const seen = new WeakMap<object, string>();

export function remember(id: string, visited: WeakSet<object>): void {
  void id;
  void visited;
}

// A described shape, however loose, and a parse boundary that takes `unknown`.
export interface Frame {
  readonly payload: Record<string, unknown>;
  readonly decode: (raw: unknown) => string;
}

// Return positions are the `unknown`-returns rule's business, not this one's.
export function snapshot(): object {
  return {};
}

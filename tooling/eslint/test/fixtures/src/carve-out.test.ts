interface Row {
  readonly id: string;
}

export type Fixture = unknown;

export function readId(row: Row): string {
  return Reflect.get(row, "id");
}

// A test helper naming the shape it expects is doing that on purpose, so the
// single-use type parameter rule is scoped away from test files.
export function parseAs<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

/** @deprecated superseded by {@link readId} */
export function readLegacyId(row: Row): string {
  return row.id;
}

// The other four rules are not scoped away — they still fire here.
export const legacyId = readLegacyId({ id: "" });

export interface Box<T = string> {
  readonly value: T;
}

export const boxed: Box<string> = { value: "" };

export function shout(text: string): string {
  return String(text).toUpperCase();
}

export function isReady(ready: boolean): boolean {
  return ready === true;
}

export function send(message: object): void {
  void message;
}

// A test double asserted into the shape the subject expects is the case the
// chained-assertion rule is scoped away from.
export const stubRow = { id: "" } as unknown as Row;

// A test that builds the bag it then reads knows what is in it, so the
// dictionary rule is scoped away from test files as well.
export function seedBag(bag: Record<string, unknown>): string {
  return String(bag.id);
}

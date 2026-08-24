interface Wire {
  readonly id: string;
}

// Every position that declares a contract: a property, a parameter, a return,
// a method signature and a class field.
export interface Envelope {
  readonly meta: Record<string, unknown>;
  readonly rows: readonly Record<string, unknown>[];
  describe(meta: Record<string, unknown>): void;
}

export function project(
  bag: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return { ...bag };
}

export class Store {
  readonly cache: Record<string, unknown> = {};
}

// Nesting inside another type changes nothing — the walk keeps going until it
// reaches a position that decides the question.
export interface Boxed {
  readonly pending: Promise<Record<string, unknown> | null>;
}

// An index signature spelled inline is the same declaration by another name.
export function fromLiteral(input: { [key: string]: unknown }): Wire {
  return { id: String(input.id) };
}

export type Loose = Record<string, any>;
export type Opaque = Record<string, object>;
export type Empty = Record<string, {}>;

// Named, but the declaration says nothing about what fills the bag.
export type Unexplained = Record<string, unknown>;

// Marked without a reason — the note has to carry one.
// Not JSON.
export type Marked = Record<string, unknown>;

// An interface's own index signature is a named declaration too, and answers
// to the same requirement.
export interface Passthrough {
  readonly kind: string;
  readonly [key: string]: unknown;
}

// A signature reached through a `const` is still a signature: the declarator
// further out is not what the parameter's contract answers to.
export const handle = (bag: Record<string, unknown>): string => String(bag.id);

// And a member of an inline type literal answers for itself, so an alias
// wrapping it cannot lend it the alias's own note.
// Not JSON: the id below is a branded string the pipeline mints.
export type Wrapped = Readonly<{
  readonly id: string;
  readonly meta: Record<string, unknown>;
}>;

// A note is not a laundering device for the three that waive the proof.
// Not JSON: the transport hands these back untyped and nothing narrows them.
export type StillWaived = Record<string, any>;

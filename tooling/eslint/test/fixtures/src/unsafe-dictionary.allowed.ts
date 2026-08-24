// The sanctioned spelling for serialized data. Stood up locally because the
// fixtures carry no workspace dependency; `JsonObject` is core's own.
type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };
type JsonObject = { readonly [key: string]: JsonValue };

export interface StoredEntry {
  readonly meta: JsonObject;
  readonly counts: Record<string, number>;
}

/**
 * Not JSON: the values arrive already hydrated, so a date field reads back as
 * a `Date` and a reference as the entity it points at.
 */
export type ResolvedMeta = Record<string, unknown>;

/**
 * Not JsonObject: this is serialized data, but the sanctioned type is out of
 * reach from here, so the bag says so rather than borrowing a claim.
 */
export type WirePatch = Readonly<Record<string, unknown>>;

export function merge(prev: ResolvedMeta, patch: WirePatch): ResolvedMeta {
  return { ...prev, ...patch };
}

// An interface's index signature, with its reason stated on the member.
export interface Passthrough {
  readonly kind: string;
  // Not JSON: the SDK carries protocol fields through this signature that
  // nothing here writes or reads.
  readonly [key: string]: unknown;
}

export function keysOf<T extends Record<string, unknown>>(value: T): string[] {
  return Object.keys(value);
}

export interface Adapter<TSchema = Record<string, unknown>> {
  connect(schema: TSchema): void;
}

export function isBag(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function collect(rows: readonly unknown[]): ResolvedMeta {
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    const bag = row as Record<string, unknown>;
    if (typeof bag.id === "string") out[bag.id] = bag;
  }
  return out;
}

export const probe = {} satisfies Record<string, unknown>;
export const legacy = <Record<string, unknown>>{};

/**
 * Not JSON: the loader hands back whatever its kind is about — a menu tree, a
 * settings bag, a queried row — and the value reaches the caller untouched.
 * Declared across several lines so the note is found at the declaration rather
 * than at the `Record` buried inside it.
 */
export type Grouped = Readonly<
  Record<string, Readonly<Record<string, unknown>>>
>;

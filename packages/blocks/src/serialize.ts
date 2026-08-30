// Port of Astro's prop serializer; see LICENSE. PROP_TYPE integer
// codes AND payload shape match Astro byte-for-byte: nested collection
// types (Map/Set/Array/typed-arrays) are encoded as nested arrays of
// `[type, value]` tuples, NOT JSON-stringified strings. The single
// outer `JSON.stringify` in `serializeProps` walks the whole tree once.
//
// Why this matters: encoding `new Map([["k", new Date(0)]])` with the
// old nested-stringify approach would lose the inner Date — it would
// round-trip as `Map<string, string>` because the second-stage JSON
// parse couldn't see the nested `[PROP_TYPE.Date, "..."]` tuple. The
// nested-array form preserves type fidelity through the whole graph.
//
// Cycle detection runs at the SSR boundary and throws with the
// component displayName so a broken prop graph fails loud rather than
// producing nested-tuple soup the client can't decode. `seen.delete`
// after the recursive walk so a *shared* reference (same object in
// two slots) is fine — only true cycles raise.

export class IslandPropSerializationError extends Error {
  static {
    IslandPropSerializationError.prototype.name =
      "IslandPropSerializationError";
  }

  readonly code: "cyclic_reference";
  readonly displayName: string | undefined;

  private constructor(
    code: "cyclic_reference",
    message: string,
    displayName: string | undefined,
  ) {
    super(message);
    this.code = code;
    this.displayName = displayName;
  }

  static cyclicReference(ctx: {
    displayName: string | undefined;
  }): IslandPropSerializationError {
    const where = ctx.displayName ? ` in <${ctx.displayName}>` : "";
    return new IslandPropSerializationError(
      "cyclic_reference",
      `Cyclic reference detected while serializing island props${where}.`,
      ctx.displayName,
    );
  }
}

export enum PROP_TYPE {
  Value = 0,
  JSON = 1,
  RegExp = 2,
  Date = 3,
  Map = 4,
  Set = 5,
  BigInt = 6,
  URL = 7,
  Uint8Array = 8,
  Uint16Array = 9,
  Uint32Array = 10,
  Infinity = 11,
}

interface SerializePropsOptions {
  readonly displayName?: string;
}

type Encoded = readonly [PROP_TYPE, unknown];

/**
 * An island's props as the codec moves them, distinct from the `IslandProps<T>`
 * an author writes. Not JSON: the codec below carries `Date`, `Map`, `Set`,
 * `BigInt`, `URL` and the typed arrays through the round trip, so what comes
 * back out is richer than a JSON parse could produce.
 */
export type SerializedProps = Readonly<Record<string, unknown>>;

export function serializeProps(
  props: SerializedProps,
  options: SerializePropsOptions = {},
): string {
  const seen = new WeakSet();
  const out: Record<string, Encoded> = {};
  for (const [key, value] of Object.entries(props)) {
    out[key] = encode(value, seen, options.displayName);
  }
  return JSON.stringify(out);
}

export function deserializeProps(payload: string): SerializedProps {
  const parsed = JSON.parse(payload) as Record<string, Encoded>;
  const out: Record<string, unknown> = {};
  for (const [key, encoded] of Object.entries(parsed)) {
    out[key] = decode(encoded);
  }
  return out;
}

function encode(
  value: unknown,
  seen: WeakSet<object>,
  displayName: string | undefined,
): Encoded {
  if (value === Infinity) return [PROP_TYPE.Infinity, 1];
  if (value === -Infinity) return [PROP_TYPE.Infinity, -1];
  if (typeof value === "bigint") return [PROP_TYPE.BigInt, value.toString()];
  if (value === null || typeof value !== "object")
    return [PROP_TYPE.Value, value];

  // From here on, value is a non-null object — guard cycles before
  // any recursion can re-enter the same node.
  if (seen.has(value)) {
    throw IslandPropSerializationError.cyclicReference({ displayName });
  }
  seen.add(value);
  try {
    return encodeInner(value, seen, displayName);
  } finally {
    // Remove the value AFTER the recursive walk completes so a sibling
    // slot can reuse the same reference without tripping the cycle
    // guard. Cycles still raise because the inner walk hits `seen.has`
    // before this `finally` runs on the outer call.
    seen.delete(value);
  }
}

// Widened back on purpose: every branch below re-derives the shape from the
// runtime tag, so the caller's narrowing buys this function nothing.
function encodeInner(
  value: unknown,
  seen: WeakSet<object>,
  displayName: string | undefined,
): Encoded {
  const tag = Object.prototype.toString.call(value);
  switch (tag) {
    case "[object Date]":
      return [PROP_TYPE.Date, (value as Date).toISOString()];
    case "[object RegExp]": {
      const re = value as RegExp;
      return [PROP_TYPE.RegExp, { source: re.source, flags: re.flags }];
    }
    case "[object URL]":
      return [PROP_TYPE.URL, (value as URL).toString()];
    case "[object Map]":
      return [
        PROP_TYPE.Map,
        [...(value as Map<unknown, unknown>).entries()].map((entry) => [
          encode(entry[0], seen, displayName),
          encode(entry[1], seen, displayName),
        ]),
      ];
    case "[object Set]":
      return [
        PROP_TYPE.Set,
        [...(value as Set<unknown>).values()].map((v) =>
          encode(v, seen, displayName),
        ),
      ];
    case "[object Uint8Array]":
      return [PROP_TYPE.Uint8Array, [...(value as Uint8Array)]];
    case "[object Uint16Array]":
      return [PROP_TYPE.Uint16Array, [...(value as Uint16Array)]];
    case "[object Uint32Array]":
      return [PROP_TYPE.Uint32Array, [...(value as Uint32Array)]];
    case "[object Array]":
      return [
        PROP_TYPE.JSON,
        (value as readonly unknown[]).map((v) => encode(v, seen, displayName)),
      ];
    default: {
      const obj: Record<string, Encoded> = {};
      const rec = value as Record<string, unknown>;
      for (const key of Object.keys(rec)) {
        obj[key] = encode(rec[key], seen, displayName);
      }
      return [PROP_TYPE.Value, obj];
    }
  }
}

/**
 * Everything `decode` can hand back — the inverse of `PROP_TYPE`, so a branch
 * added to one belongs in the other.
 */
type DecodedValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | bigint
  | Date
  | RegExp
  | URL
  | Uint8Array
  | Uint16Array
  | Uint32Array
  | Map<DecodedValue, DecodedValue>
  | Set<DecodedValue>
  | readonly DecodedValue[]
  | { readonly [key: string]: DecodedValue };

function decode(encoded: Encoded): DecodedValue {
  const [type, raw] = encoded;
  switch (type) {
    case PROP_TYPE.Value:
      return decodeValue(raw);
    case PROP_TYPE.JSON:
      return (raw as readonly Encoded[]).map(decode);
    case PROP_TYPE.RegExp: {
      const { source, flags } = raw as { source: string; flags: string };
      return new RegExp(source, flags);
    }
    case PROP_TYPE.Date:
      return new Date(raw as string);
    case PROP_TYPE.Map: {
      const entries = raw as readonly [Encoded, Encoded][];
      return new Map(entries.map(([k, v]) => [decode(k), decode(v)]));
    }
    case PROP_TYPE.Set: {
      const values = raw as readonly Encoded[];
      return new Set(values.map(decode));
    }
    case PROP_TYPE.BigInt:
      return BigInt(raw as string);
    case PROP_TYPE.URL:
      return new URL(raw as string);
    case PROP_TYPE.Uint8Array:
      return new Uint8Array(raw as readonly number[]);
    case PROP_TYPE.Uint16Array:
      return new Uint16Array(raw as readonly number[]);
    case PROP_TYPE.Uint32Array:
      return new Uint32Array(raw as readonly number[]);
    case PROP_TYPE.Infinity:
      return (raw as number) > 0 ? Infinity : -Infinity;
  }
}

function decodeValue(raw: unknown): DecodedValue {
  // The payload came out of `JSON.parse`, so a non-object here is a string,
  // number, boolean or null — every one of them a `DecodedValue` already.
  if (raw === null || typeof raw !== "object") return raw as DecodedValue;
  const out: Record<string, DecodedValue> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = decode(v as Encoded);
  }
  return out;
}

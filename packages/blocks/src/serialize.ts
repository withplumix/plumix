// Port of Astro's prop serializer (Apache-2.0). PROP_TYPE integer
// codes match Astro 1:1 so the wire format reads as a familiar tag.
// The payload shape diverges in one place: nested Map/Set/Array/typed-
// array values are stored as JSON-stringified strings (Astro stores
// them as nested arrays). That's a conscious simplification — it keeps
// the encoder/decoder symmetric and matches what `JSON.parse` returns
// in one step on the client; if a future slice wants to share fixtures
// or runtime with Astro it'll need a wire-format pass to align.
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

export interface SerializePropsOptions {
  readonly displayName?: string;
}

type Encoded = readonly [PROP_TYPE, unknown];

export function serializeProps(
  props: Readonly<Record<string, unknown>>,
  options: SerializePropsOptions = {},
): string {
  const seen = new WeakSet<object>();
  const out: Record<string, Encoded> = {};
  for (const [key, value] of Object.entries(props)) {
    out[key] = encode(value, seen, options.displayName);
  }
  return JSON.stringify(out);
}

export function deserializeProps(payload: string): Record<string, unknown> {
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

function encodeInner(
  value: object,
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
        JSON.stringify(
          [...(value as Map<unknown, unknown>).entries()].map((entry) => [
            encode(entry[0], seen, displayName),
            encode(entry[1], seen, displayName),
          ]),
        ),
      ];
    case "[object Set]":
      return [
        PROP_TYPE.Set,
        JSON.stringify(
          [...(value as Set<unknown>).values()].map((v) =>
            encode(v, seen, displayName),
          ),
        ),
      ];
    case "[object Uint8Array]":
      return [PROP_TYPE.Uint8Array, JSON.stringify([...(value as Uint8Array)])];
    case "[object Uint16Array]":
      return [
        PROP_TYPE.Uint16Array,
        JSON.stringify([...(value as Uint16Array)]),
      ];
    case "[object Uint32Array]":
      return [
        PROP_TYPE.Uint32Array,
        JSON.stringify([...(value as Uint32Array)]),
      ];
    case "[object Array]":
      return [
        PROP_TYPE.JSON,
        JSON.stringify(
          (value as readonly unknown[]).map((v) =>
            encode(v, seen, displayName),
          ),
        ),
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

function decode(encoded: Encoded): unknown {
  const [type, raw] = encoded;
  switch (type) {
    case PROP_TYPE.Value:
      return decodeValue(raw);
    case PROP_TYPE.JSON:
      return (JSON.parse(raw as string) as Encoded[]).map(decode);
    case PROP_TYPE.RegExp: {
      const { source, flags } = raw as { source: string; flags: string };
      return new RegExp(source, flags);
    }
    case PROP_TYPE.Date:
      return new Date(raw as string);
    case PROP_TYPE.Map: {
      const entries = JSON.parse(raw as string) as [Encoded, Encoded][];
      return new Map(entries.map(([k, v]) => [decode(k), decode(v)]));
    }
    case PROP_TYPE.Set: {
      const values = JSON.parse(raw as string) as Encoded[];
      return new Set(values.map(decode));
    }
    case PROP_TYPE.BigInt:
      return BigInt(raw as string);
    case PROP_TYPE.URL:
      return new URL(raw as string);
    case PROP_TYPE.Uint8Array:
      return new Uint8Array(JSON.parse(raw as string) as number[]);
    case PROP_TYPE.Uint16Array:
      return new Uint16Array(JSON.parse(raw as string) as number[]);
    case PROP_TYPE.Uint32Array:
      return new Uint32Array(JSON.parse(raw as string) as number[]);
    case PROP_TYPE.Infinity:
      return (raw as number) > 0 ? Infinity : -Infinity;
  }
}

function decodeValue(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object") return raw;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = decode(v as Encoded);
  }
  return out;
}

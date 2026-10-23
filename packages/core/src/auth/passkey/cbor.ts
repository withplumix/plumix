import { PasskeyError } from "./errors.js";

type CborKey = number | string;
export type CborValue =
  | number
  | string
  | Uint8Array
  | readonly CborValue[]
  | ReadonlyMap<CborKey, CborValue>;

const MAJOR_UNSIGNED = 0;
const MAJOR_NEGATIVE = 1;
const MAJOR_BYTES = 2;
const MAJOR_TEXT = 3;
const MAJOR_ARRAY = 4;
const MAJOR_MAP = 5;

/** An attestation object's `attStmt.x5c` sits three levels deep. */
const MAX_DEPTH = 4;

const UTF8 = new TextDecoder("utf-8", { fatal: true });

/**
 * Decodes the CBOR subset WebAuthn uses: integers, byte and text strings,
 * arrays and maps. Throws `invalid_response` on anything else.
 */
export function decodeCbor(bytes: Uint8Array): CborValue {
  const { value, length } = decodeCborPrefix(bytes);
  if (length !== bytes.length) throw malformed("trailing bytes");
  return value;
}

/** Decodes the item `bytes` starts with, and how many bytes it spans. */
export function decodeCborPrefix(bytes: Uint8Array): {
  readonly value: CborValue;
  readonly length: number;
} {
  const reader = new Reader(bytes);
  const value = reader.value();
  return { value, length: reader.offset };
}

function malformed(reason: string): PasskeyError {
  return PasskeyError.invalidResponse({ reason: `Malformed CBOR: ${reason}` });
}

class Reader {
  offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  value(depth = 0): CborValue {
    const initial = this.take(1)[0] ?? 0;
    const major = initial >> 5;
    const argument = this.argument(initial & 0x1f);
    switch (major) {
      case MAJOR_UNSIGNED:
        return argument;
      case MAJOR_NEGATIVE:
        return -1 - argument;
      case MAJOR_BYTES:
        return this.take(argument).slice();
      case MAJOR_TEXT:
        return this.text(argument);
      case MAJOR_ARRAY:
        return this.array(argument, depth + 1);
      case MAJOR_MAP:
        return this.map(argument, depth + 1);
      default:
        throw malformed(`major type ${major}`);
    }
  }

  private array(size: number, depth: number): readonly CborValue[] {
    if (depth > MAX_DEPTH) throw malformed("nested too deep");
    const items: CborValue[] = [];
    for (let i = 0; i < size; i++) items.push(this.value(depth));
    return items;
  }

  private map(size: number, depth: number): ReadonlyMap<CborKey, CborValue> {
    if (depth > MAX_DEPTH) throw malformed("nested too deep");
    const map = new Map<CborKey, CborValue>();
    for (let i = 0; i < size; i++) {
      const key = this.value(depth);
      if (typeof key !== "number" && typeof key !== "string") {
        throw malformed("map key is not an integer or text");
      }
      if (map.has(key)) throw malformed("duplicate map key");
      map.set(key, this.value(depth));
    }
    return map;
  }

  private argument(info: number): number {
    if (info < 24) return info;
    const view = (width: number): DataView => {
      const bytes = this.take(width);
      return new DataView(bytes.buffer, bytes.byteOffset, width);
    };
    switch (info) {
      case 24:
        return view(1).getUint8(0);
      case 25:
        return view(2).getUint16(0);
      case 26:
        return view(4).getUint32(0);
      case 27:
        return this.safeInteger(view(8).getBigUint64(0));
      default:
        throw malformed(`additional information ${info}`);
    }
  }

  private text(length: number): string {
    const bytes = this.take(length);
    try {
      return UTF8.decode(bytes);
    } catch {
      throw malformed("text string is not UTF-8");
    }
  }

  private safeInteger(value: bigint): number {
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw malformed("integer past Number.MAX_SAFE_INTEGER");
    }
    return Number(value);
  }

  private take(length: number): Uint8Array {
    if (length > this.bytes.length - this.offset) {
      throw malformed("length past the end of the input");
    }
    const start = this.offset;
    this.offset += length;
    return this.bytes.subarray(start, this.offset);
  }
}

// Resumes on `(occurred_at, id) < cursor`; `id` is monotonic, so ordering stays
// stable under concurrent writes.

import {
  decodeBase64urlIgnorePadding,
  encodeBase64urlNoPadding,
} from "@oslojs/encoding";

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

type CursorErrorCode = "empty" | "malformed";

export class CursorError extends Error {
  static {
    CursorError.prototype.name = "CursorError";
  }

  readonly code: CursorErrorCode;

  private constructor(code: CursorErrorCode, message: string) {
    super(message);
    this.code = code;
  }

  static empty(): CursorError {
    return new CursorError("empty", "empty cursor");
  }

  static malformed(): CursorError {
    return new CursorError("malformed", "malformed cursor");
  }
}

interface CursorPosition {
  readonly occurredAt: number;
  readonly id: number;
}

export function encodeCursor(position: CursorPosition): string {
  const raw = `${String(position.occurredAt)}.${String(position.id)}`;
  return encodeBase64urlNoPadding(ENCODER.encode(raw));
}

export function decodeCursor(encoded: string): CursorPosition {
  if (encoded === "") throw CursorError.empty();
  let raw: string;
  try {
    raw = DECODER.decode(decodeBase64urlIgnorePadding(encoded));
  } catch {
    throw CursorError.malformed();
  }
  const parts = raw.split(".");
  if (parts.length !== 2) throw CursorError.malformed();
  const occurredAt = Number(parts[0]);
  const id = Number(parts[1]);
  if (!Number.isInteger(occurredAt) || !Number.isInteger(id)) {
    throw CursorError.malformed();
  }
  // Out of range means tampering or a bug; malformed gives a typed BAD_REQUEST
  // instead of silently returning 0 rows.
  if (occurredAt < 0 || id <= 0) {
    throw CursorError.malformed();
  }
  return { occurredAt, id };
}

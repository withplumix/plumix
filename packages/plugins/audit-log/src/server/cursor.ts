// Cursor codec for `auditLog.list` pagination. The cursor encodes the
// (occurred_at, id) of the last row from the previous page so the next
// query can resume on `(occurred_at, id) < (cursor.occurredAt, cursor.id)`.
// Stable ordering even under concurrent writes because `id` is
// monotonically increasing.
//
// On-wire form: base64url (no padding) of `${occurredAt}.${id}` — readable
// enough to debug from the network tab without giving away anything
// useful for tampering. A tampered or malformed cursor lands on the
// `CursorError` branch in the RPC layer and surfaces as a typed
// `INVALID_CURSOR` to the caller.

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
  // Audit rows have positive auto-increment ids and non-negative
  // occurredAt (unix epoch). A cursor outside that range is either
  // tampering or an upstream bug — treat as malformed so the RPC
  // returns a typed BAD_REQUEST instead of silently returning 0 rows.
  if (occurredAt < 0 || id <= 0) {
    throw CursorError.malformed();
  }
  return { occurredAt, id };
}

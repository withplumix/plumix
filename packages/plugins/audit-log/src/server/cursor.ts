// Cursor codec for `auditLog.list` pagination. The cursor encodes the
// (occurred_at, id) of the last row from the previous page so the next
// query can resume on `(occurred_at, id) < (cursor.occurredAt, cursor.id)`.
// Stable ordering even under concurrent writes because `id` is
// monotonically increasing.
//
// On-wire form: url-safe base64 of `${occurredAt}.${id}` — readable
// enough to debug from the network tab without giving away anything
// useful for tampering. A tampered or malformed cursor lands on the
// `CursorError` branch in the RPC layer and surfaces as a typed
// `INVALID_CURSOR` to the caller.

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
  return toUrlSafeBase64(raw);
}

export function decodeCursor(encoded: string): CursorPosition {
  if (encoded === "") throw CursorError.empty();
  let raw: string;
  try {
    raw = fromUrlSafeBase64(encoded);
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

function toUrlSafeBase64(raw: string): string {
  // Buffer is available in Workers + Node; both runtimes the plugin
  // targets. The url-safe alphabet (+ → -, / → _, no padding) keeps
  // the value safe to drop into a query string without escaping.
  return Buffer.from(raw, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromUrlSafeBase64(encoded: string): string {
  const restored = encoded.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(restored, "base64").toString("utf8");
}

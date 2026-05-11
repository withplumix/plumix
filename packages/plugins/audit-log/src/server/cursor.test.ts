import { describe, expect, test } from "vitest";

import { CursorError, decodeCursor, encodeCursor } from "./cursor.js";

describe("encodeCursor / decodeCursor", () => {
  test("round-trips an (occurredAt, id) pair", () => {
    const original = { occurredAt: 1_715_000_000, id: 42 };
    const decoded = decodeCursor(encodeCursor(original));
    expect(decoded).toEqual(original);
  });

  test("encoded form is url-safe base64 (no '+', '/', '=' padding)", () => {
    const encoded = encodeCursor({ occurredAt: 1_715_000_000, id: 99 });
    expect(encoded).not.toMatch(/[+/=]/);
  });

  test("tampering with the body throws CursorError", () => {
    const valid = encodeCursor({ occurredAt: 1, id: 1 });
    // Flip the last char to corrupt the payload.
    const tampered = `${valid.slice(0, -1)}${valid.endsWith("A") ? "B" : "A"}`;
    expect(() => decodeCursor(tampered)).toThrow(CursorError);
  });

  test("garbage string throws CursorError", () => {
    expect(() => decodeCursor("not-a-cursor")).toThrow(CursorError);
  });

  test("empty string throws CursorError", () => {
    expect(() => decodeCursor("")).toThrow(CursorError);
  });

  test("negative occurredAt is rejected as malformed", () => {
    const encoded = encodeCursor({ occurredAt: -1, id: 1 });
    expect(() => decodeCursor(encoded)).toThrow(CursorError);
  });

  test("zero or negative id is rejected as malformed", () => {
    expect(() => decodeCursor(encodeCursor({ occurredAt: 1, id: 0 }))).toThrow(
      CursorError,
    );
    expect(() => decodeCursor(encodeCursor({ occurredAt: 1, id: -5 }))).toThrow(
      CursorError,
    );
  });
});

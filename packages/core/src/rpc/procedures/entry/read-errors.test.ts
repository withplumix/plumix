import { describe, expect, test } from "vitest";

import type { EntryReadErrorConstructors } from "./read-errors.js";
import { EntryReadError } from "../../../entries/errors.js";
import { toRpcEntryReadError } from "./read-errors.js";

// Stub the oRPC typed-error constructors: each records the code it stands for
// plus the data it was handed, so the test asserts the mapping without oRPC.
function stubErrors(): EntryReadErrorConstructors {
  const make =
    (mappedCode: string) =>
    (opts: { data: Record<string, unknown> }): Error =>
      Object.assign(new Error(mappedCode), { mappedCode, data: opts.data });
  return {
    NOT_FOUND: make("NOT_FOUND"),
    FORBIDDEN: make("FORBIDDEN"),
    BAD_REQUEST: make("BAD_REQUEST"),
  };
}

describe("toRpcEntryReadError", () => {
  test("maps not_found to NOT_FOUND carrying the entry id", () => {
    const mapped = toRpcEntryReadError(
      EntryReadError.notFound(42),
      stubErrors(),
    );
    expect(mapped).toMatchObject({
      mappedCode: "NOT_FOUND",
      data: { kind: "entry", id: 42 },
    });
  });

  test("maps forbidden to FORBIDDEN carrying the capability", () => {
    const mapped = toRpcEntryReadError(
      EntryReadError.forbidden("entry:post:read"),
      stubErrors(),
    );
    expect(mapped).toMatchObject({
      mappedCode: "FORBIDDEN",
      data: { capability: "entry:post:read" },
    });
  });

  test("maps reserved_type to BAD_REQUEST", () => {
    const mapped = toRpcEntryReadError(
      EntryReadError.reservedType("revision"),
      stubErrors(),
    );
    expect(mapped).toMatchObject({
      mappedCode: "BAD_REQUEST",
      data: { reason: "reserved_type" },
    });
  });

  test("passes a non-domain error through unchanged", () => {
    const original = new Error("boom");
    expect(toRpcEntryReadError(original, stubErrors())).toBe(original);
  });
});

import { createORPCErrorConstructorMap } from "@orpc/server";
import { describe, expect, test } from "vitest";

import { EntryReadError } from "../../../entries/errors.js";
import { RPC_ERRORS } from "../../errors.js";
import { toRpcEntryReadError } from "./read-errors.js";

const errors = createORPCErrorConstructorMap(RPC_ERRORS);

describe("toRpcEntryReadError", () => {
  test("maps not_found to NOT_FOUND carrying the entry id", () => {
    const mapped = toRpcEntryReadError(EntryReadError.notFound(42), errors);
    expect(mapped).toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "entry", id: 42 },
    });
  });

  test("maps forbidden to FORBIDDEN carrying the capability", () => {
    const mapped = toRpcEntryReadError(
      EntryReadError.forbidden("entry:post:read"),
      errors,
    );
    expect(mapped).toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:read" },
    });
  });

  test("maps reserved_type to BAD_REQUEST", () => {
    const mapped = toRpcEntryReadError(
      EntryReadError.reservedType("revision"),
      errors,
    );
    expect(mapped).toMatchObject({
      code: "BAD_REQUEST",
      data: { reason: "reserved_type" },
    });
  });

  test("declines a non-domain error so the caller rethrows its own", () => {
    expect(toRpcEntryReadError(new Error("boom"), errors)).toBeUndefined();
  });
});

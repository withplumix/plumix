import { createORPCErrorConstructorMap } from "@orpc/server";
import { describe, expect, test } from "vitest";

import { TermReadError } from "../../../terms/errors.js";
import { RPC_ERRORS } from "../../errors.js";
import { toRpcTermReadError } from "./read-errors.js";

const errors = createORPCErrorConstructorMap(RPC_ERRORS);

describe("toRpcTermReadError", () => {
  test("maps taxonomy_not_found to NOT_FOUND with the taxonomy", () => {
    const mapped = toRpcTermReadError(
      TermReadError.taxonomyNotFound("nope"),
      errors,
    );
    expect(mapped).toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "taxonomy", id: "nope" },
    });
  });

  test("maps term_not_found to NOT_FOUND with the term id", () => {
    const mapped = toRpcTermReadError(TermReadError.termNotFound(7), errors);
    expect(mapped).toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "term", id: 7 },
    });
  });

  test("maps forbidden to FORBIDDEN with the capability", () => {
    const mapped = toRpcTermReadError(
      TermReadError.forbidden("term:category:read"),
      errors,
    );
    expect(mapped).toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "term:category:read" },
    });
  });

  test("declines a non-domain error so the caller rethrows its own", () => {
    expect(toRpcTermReadError(new Error("boom"), errors)).toBeUndefined();
  });
});

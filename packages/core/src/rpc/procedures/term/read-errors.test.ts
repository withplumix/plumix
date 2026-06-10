import { describe, expect, test } from "vitest";

import type { TermReadErrorConstructors } from "./read-errors.js";
import { TermReadError } from "../../../terms/errors.js";
import { toRpcTermReadError } from "./read-errors.js";

function stubErrors(): TermReadErrorConstructors {
  const make =
    (mappedCode: string) =>
    (opts: { data: Record<string, unknown> }): Error =>
      Object.assign(new Error(mappedCode), { mappedCode, data: opts.data });
  return { NOT_FOUND: make("NOT_FOUND"), FORBIDDEN: make("FORBIDDEN") };
}

describe("toRpcTermReadError", () => {
  test("maps taxonomy_not_found to NOT_FOUND with the taxonomy", () => {
    const mapped = toRpcTermReadError(
      TermReadError.taxonomyNotFound("nope"),
      stubErrors(),
    );
    expect(mapped).toMatchObject({
      mappedCode: "NOT_FOUND",
      data: { kind: "taxonomy", id: "nope" },
    });
  });

  test("maps term_not_found to NOT_FOUND with the term id", () => {
    const mapped = toRpcTermReadError(
      TermReadError.termNotFound(7),
      stubErrors(),
    );
    expect(mapped).toMatchObject({
      mappedCode: "NOT_FOUND",
      data: { kind: "term", id: 7 },
    });
  });

  test("maps forbidden to FORBIDDEN with the capability", () => {
    const mapped = toRpcTermReadError(
      TermReadError.forbidden("term:category:read"),
      stubErrors(),
    );
    expect(mapped).toMatchObject({
      mappedCode: "FORBIDDEN",
      data: { capability: "term:category:read" },
    });
  });

  test("passes a non-domain error through unchanged", () => {
    const original = new Error("boom");
    expect(toRpcTermReadError(original, stubErrors())).toBe(original);
  });
});

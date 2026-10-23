import { describe, expect, test } from "vitest";

import { decodeCbor } from "./cbor.js";
import { PasskeyError } from "./errors.js";

function hex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/../g) ?? [], (byte) =>
    Number.parseInt(byte, 16),
  );
}

function refusalOf(input: Uint8Array): unknown {
  try {
    decodeCbor(input);
  } catch (error) {
    return error instanceof PasskeyError ? error.code : error;
  }
  return "decoded";
}

// Expected values are the RFC 8949 appendix A examples.
describe("decodeCbor", () => {
  test.each([
    ["00", 0],
    ["17", 23],
    ["1818", 24],
    ["1903e8", 1000],
    ["1a000f4240", 1_000_000],
    ["1b000000e8d4a51000", 1_000_000_000_000],
    ["20", -1],
    ["3863", -100],
    ["3903e7", -1000],
  ])("decodes the integer %s", (input, expected) => {
    expect(decodeCbor(hex(input))).toBe(expected);
  });

  test("decodes byte and text strings", () => {
    expect(decodeCbor(hex("4401020304"))).toEqual(hex("01020304"));
    expect(decodeCbor(hex("6449455446"))).toBe("IETF");
    expect(decodeCbor(hex("62c3bc"))).toBe("ü");
  });

  test("decodes arrays and maps, nested", () => {
    expect(decodeCbor(hex("8301820203820405"))).toEqual([1, [2, 3], [4, 5]]);
    expect(decodeCbor(hex("a26161016162820203"))).toEqual(
      new Map<unknown, unknown>([
        ["a", 1],
        ["b", [2, 3]],
      ]),
    );
  });
});

test("decodes four levels of nesting", () => {
  expect(decodeCbor(hex("8181818100"))).toEqual([[[[0]]]]);
});

describe("decodeCbor refuses as a malformed response", () => {
  test.each([
    ["empty input", ""],
    ["a truncated argument", "1903"],
    ["a byte string past the end", "45010203"],
    ["a text string past the end", "6261"],
    ["an array missing an item", "8201"],
    ["a map missing a value", "a101"],
    ["trailing bytes after the item", "0000"],
    ["an indefinite-length byte string", "5f42010243030405ff"],
    ["an indefinite-length text string", "7f657374726561646d696e67ff"],
    ["an indefinite-length array", "9f018202039f0405ffff"],
    ["an indefinite-length map", "bf61610161629f0203ffff"],
    ["a tag", "c11a514b67b0"],
    ["a reserved additional information", "1c"],
    ["false", "f4"],
    ["null", "f6"],
    ["a half-precision float", "f93c00"],
    ["a single-precision float", "fa47c35000"],
    ["a double-precision float", "fb3ff199999999999a"],
    ["a duplicate map key", "a2616101616102"],
    ["a text string that is not UTF-8", "62c328"],
    ["a byte-string map key", "a14000"],
    ["an integer past Number.MAX_SAFE_INTEGER", "1b0020000000000000"],
    ["an array declaring more items than bytes", "9b001fffffffffffff00"],
    ["nesting deeper than four levels", "818181818100"],
    ["a map nested deeper than four levels", "a100a100a100a100a10000"],
  ])("%s", (_, input) => {
    expect(refusalOf(hex(input))).toBe("invalid_response");
  });
});

import { describe, expect, test } from "vitest";

import { decodeBase64url, encodeBase64url, encodeHex } from "./encoding.js";

function bytes(values: number[]): Uint8Array {
  return new Uint8Array(values);
}

describe("base64url", () => {
  test("encodes empty bytes", () => {
    expect(encodeBase64url(bytes([]))).toBe("");
  });

  test("round-trips arbitrary bytes", () => {
    for (let len = 0; len < 64; len++) {
      const input = new Uint8Array(len);
      for (let i = 0; i < len; i++) input[i] = (i * 37 + 5) & 0xff;
      const decoded = decodeBase64url(encodeBase64url(input));
      expect(Array.from(decoded)).toEqual(Array.from(input));
    }
  });

  test("uses url-safe alphabet (no +, /, =)", () => {
    // 0xfb 0xef → standard base64 '++8', url-safe '--8' (no padding).
    expect(encodeBase64url(bytes([0xfb, 0xef]))).toBe("--8");
    // 0xfa 0xdf 0xdb → '+t/b', url-safe '-t_b'
    expect(encodeBase64url(bytes([0xfa, 0xdf, 0xdb]))).toBe("-t_b");
  });

  test("strips padding on encode, accepts missing padding on decode", () => {
    expect(encodeBase64url(bytes([0x00]))).toBe("AA");
    expect(encodeBase64url(bytes([0x00, 0x00]))).toBe("AAA");
    expect(decodeBase64url("AA")).toEqual(bytes([0x00]));
    expect(decodeBase64url("AAA")).toEqual(bytes([0x00, 0x00]));
  });

  test("ignores trailing padding on decode", () => {
    expect(decodeBase64url("AA==")).toEqual(bytes([0x00]));
    expect(decodeBase64url("AAA=")).toEqual(bytes([0x00, 0x00]));
  });

  test.each(["++8", "-t/b", "A A", "A", "AA=A", "AA==="])(
    "throws on %j, which is not base64url",
    (input) => {
      expect(() => decodeBase64url(input)).toThrow();
    },
  );
});

describe("encodeHex", () => {
  test("encodes each byte as two lowercase digits", () => {
    expect(encodeHex(bytes([0x00, 0x0f, 0xa0, 0xff]))).toBe("000fa0ff");
  });

  test("encodes empty bytes as an empty string", () => {
    expect(encodeHex(bytes([]))).toBe("");
  });
});

import { describe, expect, test } from "vitest";

import { base64urlToBuffer, bufferToBase64url } from "./base64url.js";

function str(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

describe("base64url", () => {
  test("encodes empty buffer", () => {
    expect(bufferToBase64url(str([]))).toBe("");
  });

  test("round-trips arbitrary bytes", () => {
    for (let len = 0; len < 64; len++) {
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = (i * 37 + 5) & 0xff;
      const encoded = bufferToBase64url(bytes.buffer);
      const decoded = new Uint8Array(base64urlToBuffer(encoded));
      expect(Array.from(decoded)).toEqual(Array.from(bytes));
    }
  });

  test("uses url-safe alphabet (no +, /, =)", () => {
    // 0xfb 0xef → standard base64 '++8', url-safe '--8' (no padding).
    expect(bufferToBase64url(str([0xfb, 0xef]))).toBe("--8");
    // 0xfa 0xdf 0xdb → '+t/b', url-safe '-t_b'
    expect(bufferToBase64url(str([0xfa, 0xdf, 0xdb]))).toBe("-t_b");
  });

  test("strips padding on encode, accepts missing padding on decode", () => {
    expect(bufferToBase64url(str([0x00]))).toBe("AA");
    expect(bufferToBase64url(str([0x00, 0x00]))).toBe("AAA");
    expect(new Uint8Array(base64urlToBuffer("AA"))).toEqual(
      new Uint8Array([0x00]),
    );
    expect(new Uint8Array(base64urlToBuffer("AAA"))).toEqual(
      new Uint8Array([0x00, 0x00]),
    );
  });
});

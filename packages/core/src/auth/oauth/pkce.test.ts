import { encodeBase64urlNoPadding } from "@oslojs/encoding";
import { describe, expect, test } from "vitest";

import { computeS256Challenge, generateCodeVerifier } from "./pkce.js";

describe("PKCE helpers", () => {
  test("generates a 43-char base64url verifier (32 bytes, no padding)", () => {
    const verifier = generateCodeVerifier();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 bytes → 43 chars in base64url-no-pad (ceil(32 * 4 / 3) = 43).
    expect(verifier).toHaveLength(43);
  });

  test("verifiers are unique across calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 32; i++) seen.add(generateCodeVerifier());
    expect(seen.size).toBe(32);
  });

  test("S256 challenge equals base64url(SHA-256(verifier))", async () => {
    const verifier = "test-verifier-12345";
    const expected = encodeBase64urlNoPadding(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(verifier),
        ),
      ),
    );
    const challenge = await computeS256Challenge(verifier);
    expect(challenge).toBe(expected);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).toHaveLength(43);
  });

  test("S256 challenge is deterministic for the same verifier", async () => {
    const v = generateCodeVerifier();
    const a = await computeS256Challenge(v);
    const b = await computeS256Challenge(v);
    expect(a).toBe(b);
  });
});

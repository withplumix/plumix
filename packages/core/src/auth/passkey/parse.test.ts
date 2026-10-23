import { describe, expect, test } from "vitest";

import type { CborValue } from "./cbor.js";
import { decodeBase64url, encodeHex } from "../../encoding.js";
import {
  ASSERTION,
  NONE_ATTESTATION,
} from "../../test/fixtures/simplewebauthn.js";
import { PasskeyError } from "./errors.js";
import {
  parseAttestationObject,
  parseAuthenticatorData,
  parseClientData,
  parseEs256PublicKey,
  rpIdHashMatches,
} from "./parse.js";

function refusalOf(parse: () => unknown): unknown {
  try {
    parse();
  } catch (error) {
    return error instanceof PasskeyError ? error.code : error;
  }
  return "parsed";
}

const ASSERTION_AUTH_DATA = decodeBase64url(
  ASSERTION.response.response.authenticatorData,
);

describe("parseAuthenticatorData", () => {
  test("reads the flags and the signature counter of a recorded assertion", () => {
    const data = parseAuthenticatorData(ASSERTION_AUTH_DATA);

    expect(data.userPresent).toBe(true);
    expect(data.signatureCounter).toBe(144);
    expect(data.attestedCredential).toBeNull();
  });

  test("reads the attested credential of a recorded registration", () => {
    const { authenticatorData } = parseAttestationObject(
      decodeBase64url(NONE_ATTESTATION.response.response.attestationObject),
    );

    expect(authenticatorData.attestedCredential?.id).toEqual(
      decodeBase64url(NONE_ATTESTATION.response.id),
    );
  });

  test("reads a cleared user-present flag", () => {
    const data = ASSERTION_AUTH_DATA.slice();
    data[32] = 0x00;

    expect(parseAuthenticatorData(data).userPresent).toBe(false);
  });

  test.each([0, 1, 36])(
    "refuses %i bytes, short of the fixed 37-byte header",
    (length) => {
      expect(
        refusalOf(() =>
          parseAuthenticatorData(ASSERTION_AUTH_DATA.subarray(0, length)),
        ),
      ).toBe("invalid_response");
    },
  );
});

describe("parseAuthenticatorData refuses truncated attested credential data", () => {
  // 37-byte header, 16-byte AAGUID, 2-byte length, 65-byte id, 77-byte key.
  const attested = registrationAuthData();

  test.each([
    ["inside the AAGUID", 40],
    ["inside the credential id length", 54],
    ["inside the credential id", 100],
    ["before the public key", 120],
    ["inside the public key", 150],
  ])("cut %s", (_, length) => {
    expect(
      refusalOf(() => parseAuthenticatorData(attested.subarray(0, length))),
    ).toBe("invalid_response");
  });
});

describe("rpIdHashMatches", () => {
  const data = parseAuthenticatorData(ASSERTION_AUTH_DATA);

  test("holds for the RP ID a recorded assertion was made for", async () => {
    expect(await rpIdHashMatches(data, "dev.dontneeda.pw")).toBe(true);
  });

  test("fails when the hash differs in one byte", async () => {
    const rpIdHash = data.rpIdHash.slice();
    rpIdHash[31] = (rpIdHash[31] ?? 0) ^ 0x01;

    expect(
      await rpIdHashMatches({ ...data, rpIdHash }, "dev.dontneeda.pw"),
    ).toBe(false);
  });
});

describe("parseAttestationObject", () => {
  test("reads the format of a recorded registration", () => {
    const object = decodeBase64url(
      NONE_ATTESTATION.response.response.attestationObject,
    );

    expect(parseAttestationObject(object).format).toBe("none");
  });

  test.each([
    ["is not a map", "80"],
    ["has no fmt", "a16861757468446174614100"],
    ["has a non-text fmt", "a263666d740168617574684461746140"],
    ["has no authData", "a163666d74646e6f6e65"],
    [
      "has a non-byte authData",
      "a263666d74646e6f6e65686175746844617461" + "00",
    ],
  ])("refuses an object that %s", (_, input) => {
    const bytes = Uint8Array.from(input.match(/../g) ?? [], (byte) =>
      Number.parseInt(byte, 16),
    );
    expect(refusalOf(() => parseAttestationObject(bytes))).toBe(
      "invalid_response",
    );
  });
});

describe("parseClientData", () => {
  const encode = (value: unknown): Uint8Array =>
    new TextEncoder().encode(JSON.stringify(value));

  test("reads the type, challenge and origin of a recorded assertion", () => {
    const data = parseClientData(
      decodeBase64url(ASSERTION.response.response.clientDataJSON),
    );

    expect(data).toEqual({
      type: "webauthn.get",
      challenge: ASSERTION.challenge,
      origin: "https://dev.dontneeda.pw",
    });
  });

  test("normalizes a padded challenge to unpadded base64url", () => {
    const data = parseClientData(
      encode({ type: "webauthn.create", challenge: "AA==", origin: "o" }),
    );

    expect(data.challenge).toBe("AA");
  });

  test.each([
    ["is not JSON", new TextEncoder().encode("{")],
    ["is not UTF-8", new Uint8Array([0x22, 0xc3, 0x28, 0x22])],
    ["is not an object", encode(null)],
    ["has a non-text type", encode({ type: 1, challenge: "AA", origin: "o" })],
    ["has no challenge", encode({ type: "webauthn.get", origin: "o" })],
    [
      "has a non-base64url challenge",
      encode({ type: "webauthn.get", challenge: "A+", origin: "o" }),
    ],
    ["has no origin", encode({ type: "webauthn.get", challenge: "AA" })],
  ])("refuses client data that %s", (_, input) => {
    expect(refusalOf(() => parseClientData(input))).toBe("invalid_response");
  });
});

describe("parseEs256PublicKey", () => {
  const coordinate = (length: number, fill: number): Uint8Array =>
    new Uint8Array(length).fill(fill);
  const coseKey = (
    entries: Partial<Record<1 | 3 | -1 | -2 | -3, CborValue>>,
  ): CborValue =>
    new Map<number, CborValue>(
      Object.entries({
        1: 2,
        3: -7,
        [-1]: 1,
        [-2]: coordinate(32, 0xaa),
        [-3]: coordinate(32, 0xbb),
        ...entries,
      }).map(([key, value]) => [Number(key), value]),
    );

  test("encodes a recorded credential's key as SEC1 uncompressed", () => {
    const { authenticatorData } = parseAttestationObject(
      decodeBase64url(NONE_ATTESTATION.response.response.attestationObject),
    );
    const cose = authenticatorData.attestedCredential?.publicKey ?? null;

    expect(cose).not.toBeNull();
    expect(encodeHex(parseEs256PublicKey(cose ?? 0))).toBe(
      NONE_ATTESTATION.publicKeySec1Hex,
    );
  });

  test("left-pads coordinates an encoder trimmed of leading zero bytes", () => {
    const key = parseEs256PublicKey(
      coseKey({ [-2]: coordinate(31, 0xaa), [-3]: coordinate(30, 0xbb) }),
    );

    expect(encodeHex(key)).toBe(
      "04" + "00" + "aa".repeat(31) + "0000" + "bb".repeat(30),
    );
  });

  test.each([
    ["an RS256 key", { 3: -257 }, "unsupported_algorithm"],
    ["an OKP key", { 1: 1 }, "unsupported_algorithm"],
    ["a P-384 key", { [-1]: 2 }, "unsupported_algorithm"],
    ["a key with no x", { [-2]: "x" }, "invalid_response"],
    ["a 33-byte y", { [-3]: coordinate(33, 0xbb) }, "invalid_response"],
  ] as const)("refuses %s", (_, entries, code) => {
    expect(refusalOf(() => parseEs256PublicKey(coseKey(entries)))).toBe(code);
  });

  test("refuses a key that is not a map", () => {
    expect(refusalOf(() => parseEs256PublicKey([]))).toBe("invalid_response");
  });
});

function registrationAuthData(): Uint8Array {
  const object = decodeBase64url(
    NONE_ATTESTATION.response.response.attestationObject,
  );
  // The attestation object ends with authData, a 197-byte string (0x58 0xc5).
  return object.subarray(object.length - 197);
}

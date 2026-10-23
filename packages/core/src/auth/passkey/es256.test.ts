import { describe, expect, test } from "vitest";

import { decodeBase64url, encodeHex } from "../../encoding.js";
import { ASSERTION } from "../../test/fixtures/simplewebauthn.js";
import { PasskeyError } from "./errors.js";
import { derSignatureToRaw, verifyEs256 } from "./es256.js";

function hex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/../g) ?? [], (byte) =>
    Number.parseInt(byte, 16),
  );
}

/** SEQUENCE { INTEGER r, INTEGER s } with each part as DER content bytes. */
function der(r: string, s: string): Uint8Array {
  const integer = (content: string): string =>
    "02" + (content.length / 2).toString(16).padStart(2, "0") + content;
  const body = integer(r) + integer(s);
  return hex("30" + (body.length / 2).toString(16).padStart(2, "0") + body);
}

function refusalOf(input: Uint8Array): unknown {
  try {
    derSignatureToRaw(input);
  } catch (error) {
    return error instanceof PasskeyError ? error.code : error;
  }
  return "converted";
}

const R = "11".repeat(32);
const S = "22".repeat(32);

describe("derSignatureToRaw", () => {
  test("concatenates 32-byte r and s", () => {
    expect(encodeHex(derSignatureToRaw(der(R, S)))).toBe(R + S);
  });

  test("drops the 0x00 DER puts before an r or s with the high bit set", () => {
    const highR = "80" + "11".repeat(31);
    const highS = "ff" + "22".repeat(31);

    expect(encodeHex(derSignatureToRaw(der("00" + highR, "00" + highS)))).toBe(
      highR + highS,
    );
  });

  test("left-pads an r or s shorter than 32 bytes", () => {
    const shortR = "11".repeat(31);
    const shortS = "22".repeat(1);

    expect(encodeHex(derSignatureToRaw(der(shortR, shortS)))).toBe(
      "00" + shortR + "00".repeat(31) + shortS,
    );
  });

  test("converts a recorded signature whose r carries a leading 0x00", () => {
    const recorded = hex(
      "3045022100d85c13a9096496ab62e5e39e7c189283d91a1683de7c96f25207f19d7a" +
        "8931a202205ae11543b79ee80b30418d0eb2e43acbc2acea385de396c3c7ddb08d72acf74d",
    );

    expect(encodeHex(derSignatureToRaw(recorded))).toBe(
      "d85c13a9096496ab62e5e39e7c189283d91a1683de7c96f25207f19d7a8931a2" +
        "5ae11543b79ee80b30418d0eb2e43acbc2acea385de396c3c7ddb08d72acf74d",
    );
  });
});

describe("derSignatureToRaw refuses as a malformed response", () => {
  test.each([
    ["empty input", new Uint8Array()],
    ["a non-SEQUENCE", hex("31" + encodeHex(der(R, S)).slice(2))],
    ["a SEQUENCE length past the end", der(R, S).subarray(0, 60)],
    ["trailing bytes", hex(encodeHex(der(R, S)) + "00")],
    ["a non-INTEGER r", hex(encodeHex(der(R, S)).replace(/^304402/, "304403"))],
    ["an empty r", der("", S)],
    ["a negative r", der("80" + "11".repeat(31), S)],
    ["an r wider than 32 bytes", der("01" + R, S)],
  ])("%s", (_, input) => {
    expect(refusalOf(input)).toBe("invalid_response");
  });
});

describe("verifyEs256", () => {
  const { response } = ASSERTION;
  const publicKey = hex(ASSERTION.publicKeySec1Hex);
  const signature = decodeBase64url(response.response.signature);

  async function signedMessage(): Promise<Uint8Array<ArrayBuffer>> {
    const authenticatorData = decodeBase64url(
      response.response.authenticatorData,
    );
    const clientDataHash = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        decodeBase64url(response.response.clientDataJSON),
      ),
    );
    const message = new Uint8Array(authenticatorData.length + 32);
    message.set(authenticatorData);
    message.set(clientDataHash, authenticatorData.length);
    return message;
  }

  test("accepts a recorded assertion signature", async () => {
    expect(await verifyEs256(publicKey, signature, await signedMessage())).toBe(
      true,
    );
  });

  test("rejects the signature over a changed message", async () => {
    const message = await signedMessage();
    message[0] = (message[0] ?? 0) ^ 0x01;

    expect(await verifyEs256(publicKey, signature, message)).toBe(false);
  });

  test("refuses a stored key that is not a P-256 point as corrupt storage", async () => {
    const offCurve = publicKey.slice();
    offCurve[64] = (offCurve[64] ?? 0) ^ 0x01;

    await expect(
      verifyEs256(offCurve, signature, await signedMessage()),
    ).rejects.toMatchObject({ code: "credential_storage_corrupt" });
  });
});

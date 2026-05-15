import { describe, expect, test } from "vitest";

import { PasskeyError } from "./errors.js";

describe("PasskeyError — no-context factories", () => {
  test.each([
    [
      "challengeNotFound",
      () => PasskeyError.challengeNotFound(),
      "challenge_not_found",
    ],
    ["invalidRpId", () => PasskeyError.invalidRpId(), "invalid_rp_id"],
    [
      "userPresenceMissing",
      () => PasskeyError.userPresenceMissing(),
      "user_presence_missing",
    ],
    [
      "credentialAlreadyRegistered",
      () => PasskeyError.credentialAlreadyRegistered(),
      "credential_already_registered",
    ],
    [
      "credentialLimitReached",
      () => PasskeyError.credentialLimitReached(),
      "credential_limit_reached",
    ],
    [
      "credentialNotFound",
      () => PasskeyError.credentialNotFound(),
      "credential_not_found",
    ],
    [
      "invalidSignature",
      () => PasskeyError.invalidSignature(),
      "invalid_signature",
    ],
    ["counterReplay", () => PasskeyError.counterReplay(), "counter_replay"],
    ["userNotFound", () => PasskeyError.userNotFound(), "user_not_found"],
  ])("%s produces class identity + code + message", (_label, factory, code) => {
    const err = factory();
    expect(err).toBeInstanceOf(PasskeyError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("PasskeyError");
    expect(err.code).toBe(code);
    expect(err.message).toBe(code);
  });
});

describe("PasskeyError.invalidClientData", () => {
  test("composes message from expectedType", () => {
    const err = PasskeyError.invalidClientData({ expectedType: "get" });
    expect(err.code).toBe("invalid_client_data");
    expect(err.message).toBe("Expected webauthn.get");
  });

  test("supports webauthn.create branch", () => {
    expect(
      PasskeyError.invalidClientData({ expectedType: "create" }).message,
    ).toBe("Expected webauthn.create");
  });
});

describe("PasskeyError.invalidOrigin", () => {
  test("class identity, code, and exposed detail", () => {
    const err = PasskeyError.invalidOrigin({
      expected: "https://example.com",
      actual: "https://evil.com",
    });
    expect(err.code).toBe("invalid_origin");
    expect(err.detail.expected).toBe("https://example.com");
    expect(err.detail.actual).toBe("https://evil.com");
  });
});

describe("PasskeyError.unsupportedAttestationFormat", () => {
  test("composes message with format value", () => {
    const err = PasskeyError.unsupportedAttestationFormat({ format: "tpm" });
    expect(err.code).toBe("unsupported_attestation_format");
    expect(err.message).toBe("Unsupported attestation format: tpm");
  });
});

describe("PasskeyError.unsupportedAlgorithm", () => {
  test("uses the supplied reason verbatim", () => {
    const err = PasskeyError.unsupportedAlgorithm({ reason: "algorithm -257" });
    expect(err.code).toBe("unsupported_algorithm");
    expect(err.message).toBe("algorithm -257");
  });
});

describe("PasskeyError.credentialStorageCorrupt", () => {
  test("uses the supplied reason verbatim", () => {
    const err = PasskeyError.credentialStorageCorrupt({
      reason: "Stored public key has unexpected type",
    });
    expect(err.code).toBe("credential_storage_corrupt");
    expect(err.message).toBe("Stored public key has unexpected type");
  });
});

describe("PasskeyError.invalidResponse", () => {
  test("uses the supplied reason verbatim", () => {
    const err = PasskeyError.invalidResponse({
      reason: "Malformed base64url",
    });
    expect(err.code).toBe("invalid_response");
    expect(err.message).toBe("Malformed base64url");
  });
});

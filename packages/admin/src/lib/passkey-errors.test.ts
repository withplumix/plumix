import { describe, expect, test } from "vitest";

import {
  PasskeyError,
  passkeyErrorDescriptor,
  unwrapPasskeyResult,
} from "./passkey-errors.js";

describe("passkeyErrorDescriptor", () => {
  test("maps a known server code to a descriptor whose source message matches the expected copy", () => {
    expect(passkeyErrorDescriptor("registration_closed").message).toMatch(
      /sign-?up is not open/i,
    );
  });

  test("maps a browser-side code", () => {
    expect(passkeyErrorDescriptor("user_cancelled").message).toMatch(/cancel/i);
  });

  test("maps invalid_origin / invalid_rp_id to the same site-scope copy", () => {
    const origin = passkeyErrorDescriptor("invalid_origin");
    const rpId = passkeyErrorDescriptor("invalid_rp_id");
    expect(origin.message).toBe(rpId.message);
    expect(origin.message).toMatch(/site/i);
  });

  test("falls back to the `unknown` descriptor for unrecognised codes", () => {
    const unknown = passkeyErrorDescriptor("something_the_server_added_later");
    expect(unknown.message).toMatch(/went wrong/i);
  });
});

describe("unwrapPasskeyResult", () => {
  test("hands a mutation the data of a ceremony that succeeded", () => {
    expect(unwrapPasskeyResult({ data: { userId: 1 }, error: null })).toEqual({
      userId: 1,
    });
  });

  test("throws the failed ceremony's code as a PasskeyError", () => {
    expect(() =>
      unwrapPasskeyResult({
        data: null,
        error: {
          code: "user_cancelled",
          message: { id: "authClient.error.userCancelled" },
        },
      }),
    ).toThrow(PasskeyError.userCancelled());
  });
});

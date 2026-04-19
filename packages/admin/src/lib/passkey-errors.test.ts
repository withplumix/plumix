import { describe, expect, test } from "vitest";

import { getPasskeyErrorMessage } from "./passkey-errors.js";

describe("getPasskeyErrorMessage", () => {
  test("maps a known server code to a user-facing string", () => {
    expect(getPasskeyErrorMessage("registration_closed")).toMatch(
      /sign-?up is not open/i,
    );
  });

  test("maps a browser-side code", () => {
    expect(getPasskeyErrorMessage("user_cancelled")).toMatch(/cancel/i);
  });

  test("maps invalid_origin / invalid_rp_id to the same site-scope copy", () => {
    const origin = getPasskeyErrorMessage("invalid_origin");
    const rpId = getPasskeyErrorMessage("invalid_rp_id");
    expect(origin).toBe(rpId);
    expect(origin).toMatch(/site/i);
  });

  test("falls back to the `unknown` message for unrecognised codes", () => {
    const unknown = getPasskeyErrorMessage("something_the_server_added_later");
    expect(unknown).toMatch(/went wrong/i);
  });
});

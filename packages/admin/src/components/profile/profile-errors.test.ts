import { PasskeyError } from "@/lib/passkey-errors.js";
import { ORPCError } from "@orpc/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  mintApiTokenErrorDescriptor,
  passkeyDeleteErrorDescriptor,
  passkeyEnrollErrorDescriptor,
  passkeyRenameErrorDescriptor,
  requestEmailChangeErrorDescriptor,
  revokeAllSessionsErrorDescriptor,
  revokeApiTokenErrorDescriptor,
  revokeSessionErrorDescriptor,
} from "./profile-errors.js";

afterEach(() => {
  vi.restoreAllMocks();
});

// Each failure below carries no reason the card names, so the card shows its
// own retry copy rather than the error's text.
describe("profile error descriptors", () => {
  test("requesting an email change gets the localized retry copy", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(
      requestEmailChangeErrorDescriptor(new ORPCError("FORBIDDEN")),
    ).toMatchObject({
      id: "userEdit.email.error.requestFallback",
      message: "Couldn't request the change. Try again.",
    });
  });

  test("renaming a passkey gets the localized retry copy", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(
      passkeyRenameErrorDescriptor(new ORPCError("FORBIDDEN")),
    ).toMatchObject({
      id: "profile.passkeys.rename.fallback",
      message: "Couldn't rename the passkey. Try again.",
    });
  });

  test("deleting a passkey gets the localized retry copy", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(
      passkeyDeleteErrorDescriptor(new ORPCError("FORBIDDEN")),
    ).toMatchObject({
      id: "profile.passkeys.delete.fallback",
      message: "Couldn't delete the passkey. Try again.",
    });
  });

  test("enrolling a passkey that fails for a reason the card doesn't name gets the localized retry copy", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(
      passkeyEnrollErrorDescriptor(
        PasskeyError.ofCode({ code: "challenge_not_found" }),
      ),
    ).toMatchObject({
      id: "profile.passkeys.enroll.fallback",
      message: "Couldn't enrol the passkey. Try again.",
    });
  });

  test("signing out other devices gets the localized retry copy", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(
      revokeAllSessionsErrorDescriptor(new ORPCError("FORBIDDEN")),
    ).toMatchObject({
      id: "profile.sessions.revokeAll.fallback",
      message: "Couldn't revoke sessions. Try again.",
    });
  });

  test("revoking one session gets the localized retry copy", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(
      revokeSessionErrorDescriptor(new ORPCError("FORBIDDEN")),
    ).toMatchObject({
      id: "profile.sessions.revoke.fallback",
      message: "Couldn't revoke the session. Try again.",
    });
  });

  test("minting an API token gets the localized retry copy", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(
      mintApiTokenErrorDescriptor(new ORPCError("FORBIDDEN")),
    ).toMatchObject({
      id: "apiTokens.mint.fallback",
      message: "Couldn't mint token. Try again.",
    });
  });

  test("revoking an API token gets the localized retry copy", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(
      revokeApiTokenErrorDescriptor(new ORPCError("FORBIDDEN")),
    ).toMatchObject({
      id: "apiTokens.revoke.fallback",
      message: "Couldn't revoke. Try again.",
    });
  });
});

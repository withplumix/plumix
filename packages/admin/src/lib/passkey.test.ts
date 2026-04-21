import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { bufferToBase64url } from "./base64url.js";
import { PasskeyError } from "./passkey-errors.js";
import {
  acceptInviteWithPasskey,
  registerWithPasskey,
  signInWithPasskey,
  signOut,
} from "./passkey.js";

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function callAt(
  mock: FetchMock,
  index: number,
): [input: RequestInfo | URL, init?: RequestInit] {
  const call = mock.mock.calls[index];
  if (!call) throw new Error(`expected fetch call at index ${index}`);
  return call;
}

function fakeRegistrationOptions() {
  // `rawId` style (base64url) values — client will decode these to buffers.
  return {
    rp: { id: "cms.example", name: "Plumix" },
    user: { id: "dXNlci0x", name: "a@example.test", displayName: "a" },
    challenge: "Y2hhbGxlbmdl",
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    timeout: 60_000,
    attestation: "none",
  };
}

function fakeAuthenticationOptions() {
  return {
    rpId: "cms.example",
    challenge: "Y2hhbGxlbmdl",
    timeout: 60_000,
    userVerification: "preferred",
    allowCredentials: [{ type: "public-key", id: "Y3JlZC1pZA" }],
  };
}

function fakeCreatedCredential(): PublicKeyCredential {
  const bytes = new Uint8Array([0x01, 0x02, 0x03]).buffer;
  return {
    id: "credential-id",
    rawId: bytes,
    type: "public-key",
    response: {
      clientDataJSON: bytes,
      attestationObject: bytes,
      getTransports: () => ["internal"],
    },
  } as unknown as PublicKeyCredential;
}

function fakeAssertionCredential(): PublicKeyCredential {
  const bytes = new Uint8Array([0x0a, 0x0b, 0x0c]).buffer;
  return {
    id: "credential-id",
    rawId: bytes,
    type: "public-key",
    response: {
      clientDataJSON: bytes,
      authenticatorData: bytes,
      signature: bytes,
      userHandle: null,
    },
  } as unknown as PublicKeyCredential;
}

let fetchMock: FetchMock;
let credentialsCreate: ReturnType<typeof vi.fn>;
let credentialsGet: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);

  credentialsCreate = vi.fn();
  credentialsGet = vi.fn();
  Object.defineProperty(globalThis.navigator, "credentials", {
    configurable: true,
    value: { create: credentialsCreate, get: credentialsGet },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("registerWithPasskey", () => {
  test("round-trips options → create → verify and returns userId", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(fakeRegistrationOptions()))
      .mockResolvedValueOnce(jsonResponse({ userId: 42 }));
    credentialsCreate.mockResolvedValue(fakeCreatedCredential());

    const result = await registerWithPasskey({
      email: "a@example.test",
      name: "Alice",
    });
    expect(result).toEqual({ userId: 42 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const optionsCall = callAt(fetchMock, 0);
    expect(optionsCall[0]).toBe("/_plumix/auth/passkey/register/options");
    expect(optionsCall[1]?.method).toBe("POST");
    expect(optionsCall[1]?.credentials).toBe("same-origin");
    const optionsHeaders = optionsCall[1]?.headers as Record<string, string>;
    expect(optionsHeaders["x-plumix-request"]).toBe("1");
    expect(JSON.parse(optionsCall[1]?.body as string)).toEqual({
      email: "a@example.test",
      name: "Alice",
    });

    const verifyCall = callAt(fetchMock, 1);
    expect(verifyCall[0]).toBe("/_plumix/auth/passkey/register/verify");
    const verifyBody = JSON.parse(verifyCall[1]?.body as string) as {
      rawId: string;
      response: { clientDataJSON: string; attestationObject: string };
    };
    expect(verifyBody.rawId).toBe(
      bufferToBase64url(new Uint8Array([0x01, 0x02, 0x03]).buffer),
    );
    expect(typeof verifyBody.response.clientDataJSON).toBe("string");
    expect(typeof verifyBody.response.attestationObject).toBe("string");
  });

  test("server 403 → PasskeyError with the server code", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "registration_closed" }, 403),
    );

    const rejection = registerWithPasskey({ email: "x@example.test" });
    await expect(rejection).rejects.toBeInstanceOf(PasskeyError);
    await expect(rejection).rejects.toMatchObject({
      code: "registration_closed",
    });
    // Only the options call ran — verify was never reached.
    expect(credentialsCreate).not.toHaveBeenCalled();
  });

  // DOMException.name → PasskeyError.code mapping. Parametrised so the
  // taxonomy is exhaustively covered by one run.
  test.each([
    ["NotAllowedError", "user_cancelled"],
    ["AbortError", "user_cancelled"],
    ["InvalidStateError", "credential_already_registered"],
    ["NotSupportedError", "no_authenticator"],
    ["SomeUnknownDomError", "unknown"],
  ] as const)(
    "navigator.credentials.create rejecting %s → %s",
    async (domName, expectedCode) => {
      fetchMock.mockResolvedValueOnce(jsonResponse(fakeRegistrationOptions()));
      credentialsCreate.mockRejectedValue(new DOMException("x", domName));

      await expect(
        registerWithPasskey({ email: "a@example.test" }),
      ).rejects.toMatchObject({ code: expectedCode });
    },
  );
});

describe("signInWithPasskey", () => {
  test("round-trips options → get → verify and returns userId", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(fakeAuthenticationOptions()))
      .mockResolvedValueOnce(jsonResponse({ userId: 7 }));
    credentialsGet.mockResolvedValue(fakeAssertionCredential());

    const result = await signInWithPasskey("a@example.test");
    expect(result).toEqual({ userId: 7 });

    const optionsCall = callAt(fetchMock, 0);
    expect(optionsCall[0]).toBe("/_plumix/auth/passkey/login/options");
    expect(JSON.parse(optionsCall[1]?.body as string)).toEqual({
      email: "a@example.test",
    });

    const verifyCall = callAt(fetchMock, 1);
    expect(verifyCall[0]).toBe("/_plumix/auth/passkey/login/verify");
    const verifyBody = JSON.parse(verifyCall[1]?.body as string) as {
      response: { userHandle: string | null };
    };
    expect(verifyBody.response.userHandle).toBeNull();
  });

  test("omits email from options body when not provided", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(fakeAuthenticationOptions()))
      .mockResolvedValueOnce(jsonResponse({ userId: 1 }));
    credentialsGet.mockResolvedValue(fakeAssertionCredential());

    await signInWithPasskey();
    expect(JSON.parse(callAt(fetchMock, 0)[1]?.body as string)).toEqual({});
  });

  test("network failure → network_error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(signInWithPasskey()).rejects.toMatchObject({
      code: "network_error",
    });
  });

  test("server returns 400 with credential_not_found", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(fakeAuthenticationOptions()))
      .mockResolvedValueOnce(
        jsonResponse({ error: "credential_not_found" }, 400),
      );
    credentialsGet.mockResolvedValue(fakeAssertionCredential());

    await expect(signInWithPasskey()).rejects.toMatchObject({
      code: "credential_not_found",
    });
  });
});

describe("signOut", () => {
  test("POSTs to /_plumix/auth/signout with the CSRF header", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    await signOut();
    const call = callAt(fetchMock, 0);
    expect(call[0]).toBe("/_plumix/auth/signout");
    expect(call[1]?.method).toBe("POST");
    expect(
      (call[1]?.headers as Record<string, string>)["x-plumix-request"],
    ).toBe("1");
  });
});

describe("acceptInviteWithPasskey", () => {
  test("verify POST body nests the full credential under `response` (server schema)", async () => {
    // Critical regression guard: the server's
    // `inviteRegisterVerifyInputSchema` is `{ token, response: credential }`
    // — spreading the credential at the top level (earlier bug) made
    // every accept-invite fail with `invalid_input`. Assert the shape
    // explicitly so a future refactor can't regress.
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          options: fakeRegistrationOptions(),
          invitee: {
            email: "invited@example.test",
            role: "editor",
            name: null,
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ userId: 99 }));
    credentialsCreate.mockResolvedValue(fakeCreatedCredential());

    const result = await acceptInviteWithPasskey({
      token: "invite-token-xyz",
      name: "Invited",
    });
    expect(result.userId).toBe(99);
    expect(result.invitee.email).toBe("invited@example.test");

    const optionsCall = callAt(fetchMock, 0);
    expect(optionsCall[0]).toBe("/_plumix/auth/invite/register/options");
    expect(JSON.parse(optionsCall[1]?.body as string)).toEqual({
      token: "invite-token-xyz",
      name: "Invited",
    });

    const verifyCall = callAt(fetchMock, 1);
    expect(verifyCall[0]).toBe("/_plumix/auth/invite/register/verify");
    const verifyBody = JSON.parse(verifyCall[1]?.body as string) as {
      token: string;
      response: {
        id: string;
        rawId: string;
        type: string;
        response: { clientDataJSON: string; attestationObject: string };
      };
      // Fields that must NOT leak to the top level — catches the
      // regression where the credential was spread instead of nested.
      id?: unknown;
      rawId?: unknown;
    };
    expect(verifyBody.token).toBe("invite-token-xyz");
    expect(verifyBody.id).toBeUndefined();
    expect(verifyBody.rawId).toBeUndefined();
    expect(verifyBody.response.id).toBe("credential-id");
    expect(verifyBody.response.type).toBe("public-key");
    expect(typeof verifyBody.response.response.clientDataJSON).toBe("string");
  });

  test("server 404 on invalid token → PasskeyError with invalid_token code", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "invalid_token" }, 404),
    );

    const rejection = acceptInviteWithPasskey({ token: "bogus" });
    await expect(rejection).rejects.toBeInstanceOf(PasskeyError);
    await expect(rejection).rejects.toMatchObject({ code: "invalid_token" });
    // Options call failed → credential create never fired.
    expect(credentialsCreate).not.toHaveBeenCalled();
  });

  test("omits name from the options body when not provided", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          options: fakeRegistrationOptions(),
          invitee: { email: "x@example.test", role: "subscriber", name: null },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ userId: 1 }));
    credentialsCreate.mockResolvedValue(fakeCreatedCredential());

    await acceptInviteWithPasskey({ token: "t" });
    const optionsCall = callAt(fetchMock, 0);
    expect(JSON.parse(optionsCall[1]?.body as string)).toEqual({ token: "t" });
  });
});

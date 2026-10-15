import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createAuthClient } from "./auth-client.js";

interface SentRequest {
  readonly url: string;
  readonly body: unknown;
}

function serverAnswering(...responses: (() => Response)[]): {
  readonly sent: SentRequest[];
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
} {
  const sent: SentRequest[] = [];
  return {
    sent,
    fetch: (url, init) => {
      sent.push({
        url,
        body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      });
      const respond = responses.shift();
      if (respond === undefined) throw new Error(`unexpected request ${url}`);
      return Promise.resolve(respond());
    },
  };
}

const registrationOptions = {
  rp: { id: "cms.example", name: "Plumix" },
  user: { id: "dXNlci0x", name: "jane@example.test", displayName: "Jane" },
  challenge: "Y2hhbGxlbmdl",
  pubKeyCredParams: [{ type: "public-key", alg: -7 }],
  attestation: "none",
};

const authenticationOptions = {
  rpId: "cms.example",
  challenge: "Y2hhbGxlbmdl",
  userVerification: "preferred",
};

const bytes = (...values: number[]): ArrayBuffer =>
  new Uint8Array(values).buffer;

const createdCredential = {
  id: "credential-id",
  rawId: bytes(1, 2, 3),
  type: "public-key",
  response: {
    clientDataJSON: bytes(1, 2, 3),
    attestationObject: bytes(1, 2, 3),
    getTransports: () => ["internal"],
  },
};

const assertedCredential = {
  id: "credential-id",
  rawId: bytes(10, 11, 12),
  type: "public-key",
  response: {
    clientDataJSON: bytes(10, 11, 12),
    authenticatorData: bytes(10, 11, 12),
    signature: bytes(10, 11, 12),
    userHandle: null,
  },
};

const session = (): Response =>
  Response.json({
    json: {
      user: { id: 7, email: "jane@example.test", name: null, role: "admin" },
    },
  });

const credentials = {
  create: vi.fn<() => Promise<unknown>>(),
  get: vi.fn<() => Promise<unknown>>(),
};

beforeEach(() => {
  vi.stubGlobal("navigator", { credentials });
});

afterEach(() => {
  vi.unstubAllGlobals();
  credentials.create.mockReset();
  credentials.get.mockReset();
});

function clientFor(server: ReturnType<typeof serverAnswering>) {
  return createAuthClient({
    basePath: () => "/blog",
    fetch: server.fetch,
    navigate: () => undefined,
  }).authClient;
}

describe("authClient.signIn.passkey", () => {
  test("runs the ceremony against the base-pathed endpoints and resolves the signed-in account", async () => {
    const server = serverAnswering(
      () => Response.json(authenticationOptions),
      () => Response.json({ userId: 7, redirectTo: "/blog/_plumix/admin" }),
      session,
    );
    credentials.get.mockResolvedValue(assertedCredential);

    const result = await clientFor(server).signIn.passkey({
      email: "jane@example.test",
    });

    expect(result).toEqual({
      data: { userId: 7, redirectTo: "/blog/_plumix/admin" },
      error: null,
    });
    expect(server.sent).toEqual([
      {
        url: "/blog/_plumix/auth/passkey/login/options",
        body: { email: "jane@example.test" },
      },
      {
        url: "/blog/_plumix/auth/passkey/login/verify",
        body: {
          id: "credential-id",
          rawId: "CgsM",
          type: "public-key",
          response: {
            clientDataJSON: "CgsM",
            authenticatorData: "CgsM",
            signature: "CgsM",
            userHandle: null,
          },
        },
      },
      { url: "/blog/_plumix/rpc/auth/session", body: { json: {} } },
    ]);
  });

  test("a dismissed prompt resolves user_cancelled", async () => {
    const server = serverAnswering(() => Response.json(authenticationOptions));
    credentials.get.mockRejectedValue(
      new DOMException("dismissed", "NotAllowedError"),
    );

    const result = await clientFor(server).signIn.passkey();

    expect(result.error?.code).toBe("user_cancelled");
    expect(server.sent).toHaveLength(1);
  });

  test("a refused assertion resolves the server's code", async () => {
    const server = serverAnswering(
      () => Response.json(authenticationOptions),
      () => Response.json({ error: "credential_not_found" }, { status: 400 }),
    );
    credentials.get.mockResolvedValue(assertedCredential);

    const result = await clientFor(server).signIn.passkey();

    expect(result.error?.code).toBe("credential_not_found");
  });
});

describe("authClient.passkey.register", () => {
  test("registers a passkey for the email and resolves the account", async () => {
    const server = serverAnswering(
      () => Response.json(registrationOptions),
      () => Response.json({ userId: 7, redirectTo: "/blog/_plumix/admin" }),
      session,
    );
    credentials.create.mockResolvedValue(createdCredential);

    const result = await clientFor(server).passkey.register({
      email: "jane@example.test",
      name: "Jane",
    });

    expect(result.data).toEqual({
      userId: 7,
      redirectTo: "/blog/_plumix/admin",
    });
    expect(server.sent.slice(0, 2)).toEqual([
      {
        url: "/blog/_plumix/auth/passkey/register/options",
        body: { email: "jane@example.test", name: "Jane" },
      },
      {
        url: "/blog/_plumix/auth/passkey/register/verify",
        body: {
          id: "credential-id",
          rawId: "AQID",
          type: "public-key",
          response: {
            clientDataJSON: "AQID",
            attestationObject: "AQID",
            transports: ["internal"],
          },
        },
      },
    ]);
  });
});

describe("authClient.invite.register", () => {
  test("nests the credential under `response` and resolves the invitee", async () => {
    const invitee = { email: "jane@example.test", role: "editor", name: null };
    const server = serverAnswering(
      () => Response.json({ options: registrationOptions, invitee }),
      () => Response.json({ userId: 7, redirectTo: "/blog/_plumix/admin" }),
      session,
    );
    credentials.create.mockResolvedValue(createdCredential);

    const result = await clientFor(server).invite.register({ token: "t0ken" });

    expect(result.data).toEqual({
      userId: 7,
      redirectTo: "/blog/_plumix/admin",
      invitee,
    });
    expect(server.sent[0]).toEqual({
      url: "/blog/_plumix/auth/invite/register/options",
      body: { token: "t0ken" },
    });
    expect(server.sent[1]?.body).toMatchObject({
      token: "t0ken",
      response: { id: "credential-id", rawId: "AQID" },
    });
  });

  test("an invalid token resolves invalid_token", async () => {
    const server = serverAnswering(() =>
      Response.json({ error: "invalid_token" }, { status: 404 }),
    );

    const result = await clientFor(server).invite.register({ token: "nope" });

    expect(result.error?.code).toBe("invalid_token");
  });
});

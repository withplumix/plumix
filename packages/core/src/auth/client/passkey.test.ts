import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { credentials as credentialsTable } from "../../db/schema/credentials.js";
import { decodeBase64url, encodeBase64url } from "../../encoding.js";
import {
  createDispatcherHarness,
  plumixRequest,
} from "../../test/dispatcher.js";
import {
  buildAttestation,
  generatePasskeyKeyPair,
  randomCredentialId,
} from "../../test/fixtures/webauthn.js";
import { SESSION_COOKIE_NAME } from "../cookies.js";
import { createSession } from "../sessions.js";
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
  create: vi.fn<(options: CredentialCreationOptions) => Promise<unknown>>(),
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

/** An authenticator that signs a real attestation for the options it gets. */
function enrolsPasskey(): void {
  credentials.create.mockImplementation(
    ({ publicKey }: CredentialCreationOptions) => {
      const credentialId = randomCredentialId();
      const challenge = publicKey?.challenge as Uint8Array<ArrayBuffer>;
      const built = buildAttestation({
        keyPair: generatePasskeyKeyPair(),
        rpId: "cms.example",
        origin: "https://cms.example",
        challenge: encodeBase64url(new Uint8Array(challenge)),
        credentialId,
      });
      return Promise.resolve({
        id: built.credentialIdBase64Url,
        rawId: credentialId.buffer,
        type: "public-key",
        response: {
          clientDataJSON: decodeBase64url(built.clientDataJSON).buffer,
          attestationObject: decodeBase64url(built.attestationObject).buffer,
          getTransports: () => ["internal"],
        },
      });
    },
  );
}

/** A signed-in auth client whose every request reaches core's real handlers. */
async function signedInClient() {
  const h = await createDispatcherHarness();
  const user = await h.seedUser("subscriber");
  const { token } = await createSession(h.db, { userId: user.id });
  const { authClient } = createAuthClient({
    basePath: () => "",
    fetch: (url, init) => {
      const headers = new Headers(init.headers);
      headers.append("cookie", `${SESSION_COOKIE_NAME}=${token}`);
      return h.dispatch(plumixRequest(url, { ...init, headers }));
    },
    navigate: () => undefined,
  });
  return { h, user, authClient };
}

describe("authClient.passkey.list", () => {
  test("shows a passkey the signed-in user just registered", async () => {
    const { user, authClient } = await signedInClient();
    enrolsPasskey();
    const registered = await authClient.passkey.register({
      email: user.email,
    });
    expect(registered.error).toBeNull();

    const result = await authClient.passkey.list();

    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      expect.objectContaining({ name: null, transports: ["internal"] }),
    ]);
    expect(result.data?.[0]?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("authClient.passkey.rename", () => {
  test("renames one of the user's passkeys", async () => {
    const { h, user, authClient } = await signedInClient();
    const passkey = await h.factory.credential.create({
      userId: user.id,
      publicKey: Buffer.from([1, 2, 3]),
    });

    const result = await authClient.passkey.rename(passkey.id, "Work laptop");

    expect(result).toEqual({
      data: { id: passkey.id, name: "Work laptop" },
      error: null,
    });
    const stored = await h.db
      .select()
      .from(credentialsTable)
      .where(eq(credentialsTable.userId, user.id));
    expect(stored.map(({ name }) => name)).toEqual(["Work laptop"]);
  });
});

describe("authClient.passkey.remove", () => {
  test("removes a passkey while the user has another", async () => {
    const { h, user, authClient } = await signedInClient();
    const kept = await h.factory.credential.create({
      userId: user.id,
      publicKey: Buffer.from([1, 2, 3]),
    });
    const removed = await h.factory.credential.create({
      userId: user.id,
      publicKey: Buffer.from([4, 5, 6]),
    });

    const result = await authClient.passkey.remove(removed.id);

    expect(result).toEqual({ data: { id: removed.id }, error: null });
    const stored = await h.db
      .select()
      .from(credentialsTable)
      .where(eq(credentialsTable.userId, user.id));
    expect(stored.map(({ id }) => id)).toEqual([kept.id]);
  });

  test("refuses to remove the user's only passkey with last_credential, keeping it", async () => {
    const { h, user, authClient } = await signedInClient();
    const only = await h.factory.credential.create({
      userId: user.id,
      publicKey: Buffer.from([1, 2, 3]),
    });

    const result = await authClient.passkey.remove(only.id);

    expect(result.error?.code).toBe("last_credential");
    expect(result.error?.message.id).toBe("authClient.error.lastCredential");
    const stored = await h.db
      .select()
      .from(credentialsTable)
      .where(eq(credentialsTable.userId, user.id));
    expect(stored.map(({ id }) => id)).toEqual([only.id]);
  });
});

describe("another user's passkey", () => {
  test("resolves not_found to rename", async () => {
    const { h, authClient } = await signedInClient();
    const other = await h.seedUser("subscriber");
    const theirs = await h.factory.credential.create({
      userId: other.id,
      publicKey: Buffer.from([1, 2, 3]),
      name: "Theirs",
    });

    const result = await authClient.passkey.rename(theirs.id, "Mine now");

    expect(result.error?.code).toBe("not_found");
    expect(result.error?.message.id).toBe("authClient.error.notFound");
  });

  test("resolves not_found to remove", async () => {
    const { h, authClient } = await signedInClient();
    const other = await h.seedUser("subscriber");
    const theirs = await h.factory.credential.create({
      userId: other.id,
      publicKey: Buffer.from([1, 2, 3]),
    });
    await h.factory.credential.create({
      userId: other.id,
      publicKey: Buffer.from([4, 5, 6]),
    });

    const result = await authClient.passkey.remove(theirs.id);

    expect(result.error?.code).toBe("not_found");
  });
});

describe("a refusal that reaches passkey.list before core does", () => {
  // As the Cloudflare demo runtime's gate answers `/_plumix/rpc/auth/credentials/`.
  const refused = () =>
    Response.json({ error: "Not available in the demo" }, { status: 403 });

  test("from a runtime that refuses the passkeys area resolves forbidden", async () => {
    const server = serverAnswering(refused);

    const result = await clientFor(server).passkey.list();

    expect(result.error?.code).toBe("forbidden");
    expect(server.sent[0]?.url).toBe("/blog/_plumix/rpc/auth/credentials/list");
  });

  test("from a proxy in front of the site resolves unknown", async () => {
    const server = serverAnswering(() =>
      Response.json({ error: "Bad gateway" }, { status: 502 }),
    );

    const result = await clientFor(server).passkey.list();

    expect(result.error?.code).toBe("unknown");
  });

  test("answered 200 without an RPC envelope resolves unknown", async () => {
    const server = serverAnswering(() => Response.json({}));

    const result = await clientFor(server).passkey.list();

    expect(result).toMatchObject({ data: null, error: { code: "unknown" } });
  });
});

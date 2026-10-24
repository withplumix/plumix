import { describe, expect, test } from "vitest";

import type {
  CreateDispatcherHarnessOptions,
  DispatcherHarness,
} from "../../test/dispatcher.js";
import {
  createDispatcherHarness,
  plumixRequest,
} from "../../test/dispatcher.js";
import { SESSION_COOKIE_NAME } from "../cookies.js";
import { createSession } from "../sessions.js";
import { createAuthClient } from "./auth-client.js";

/** An auth client whose every request reaches core's real handlers. */
function clientOf(h: DispatcherHarness, token: string) {
  return createAuthClient({
    basePath: () => "",
    fetch: (url, init) => {
      const headers = new Headers(init.headers);
      headers.append("cookie", `${SESSION_COOKIE_NAME}=${token}`);
      return h.dispatch(plumixRequest(url, { ...init, headers }));
    },
    navigate: () => undefined,
  }).authClient;
}

async function signedInClient(
  config?: CreateDispatcherHarnessOptions["config"],
) {
  const h = await createDispatcherHarness({ config });
  const user = await h.seedUser("subscriber");
  const { token } = await createSession(h.db, { userId: user.id });
  return { h, user, authClient: clientOf(h, token) };
}

describe("authClient.oauth.accounts and unlink", () => {
  test("a user with a passkey lists a linked provider and unlinks it", async () => {
    const { h, user, authClient } = await signedInClient();
    await h.factory.credential.create({
      userId: user.id,
      publicKey: Buffer.from([1, 2, 3]),
    });
    await h.factory.oauthAccount.create({
      userId: user.id,
      provider: "github",
      providerAccountId: "gh-42",
      createdAt: new Date("2026-01-02T03:04:05Z"),
    });

    const listed = await authClient.oauth.accounts();

    expect(listed.error).toBeNull();
    expect(listed.data).toEqual([
      {
        id: "gh-42",
        provider: "github",
        linkedAt: new Date("2026-01-02T03:04:05Z"),
      },
    ]);

    const unlinked = await authClient.oauth.unlink("github");

    expect(unlinked.error).toBeNull();
    expect(unlinked.data).toEqual({ provider: "github" });
    expect((await authClient.oauth.accounts()).data).toEqual([]);
  });

  test("an only way in resolves last_sign_in_method, and the link stays", async () => {
    const { h, user, authClient } = await signedInClient();
    await h.factory.oauthAccount.create({
      userId: user.id,
      provider: "github",
    });

    const result = await authClient.oauth.unlink("github");

    expect(result.error?.code).toBe("last_sign_in_method");
    expect(result.error?.message.id).toBe("authClient.error.lastSignInMethod");
    expect((await authClient.oauth.accounts()).data).toHaveLength(1);
  });

  test("an only link unlinks on a site that signs in by email", async () => {
    const { h, user, authClient } = await signedInClient({
      auth: { magicLink: { siteName: "Test Site" } },
    });
    await h.factory.oauthAccount.create({
      userId: user.id,
      provider: "github",
    });

    const result = await authClient.oauth.unlink("github");

    expect(result.error).toBeNull();
    expect((await authClient.oauth.accounts()).data).toEqual([]);
  });

  test("two concurrent unlinks of the last two providers can't both succeed", async () => {
    const { h, user, authClient } = await signedInClient();
    await h.factory.oauthAccount.create({
      userId: user.id,
      provider: "github",
    });
    await h.factory.oauthAccount.create({
      userId: user.id,
      provider: "google",
    });

    const results = await Promise.all([
      authClient.oauth.unlink("github"),
      authClient.oauth.unlink("google"),
    ]);

    expect(results.map((result) => result.error?.code ?? null).sort()).toEqual(
      ["last_sign_in_method", null].sort(),
    );
    expect((await authClient.oauth.accounts()).data).toHaveLength(1);
  });

  test("another user's link is neither listed nor unlinked", async () => {
    const { h, user, authClient } = await signedInClient();
    await h.factory.credential.create({
      userId: user.id,
      publicKey: Buffer.from([1, 2, 3]),
    });
    const other = await h.seedUser("subscriber");
    await h.factory.credential.create({
      userId: other.id,
      publicKey: Buffer.from([4, 5, 6]),
    });
    await h.factory.oauthAccount.create({
      userId: other.id,
      provider: "github",
    });
    const { token } = await createSession(h.db, { userId: other.id });
    const theirs = clientOf(h, token);

    const listed = await authClient.oauth.accounts();
    const unlinked = await authClient.oauth.unlink("github");

    expect(listed.data).toEqual([]);
    expect(unlinked.error?.code).toBe("not_found");
    expect((await theirs.oauth.accounts()).data).toHaveLength(1);
  });

  test("a runtime that refuses oauthLinking resolves forbidden", async () => {
    // As the demo runtime's gate answers every refused area's request.
    const { authClient } = createAuthClient({
      basePath: () => "",
      fetch: () =>
        Promise.resolve(
          Response.json(
            { error: "Not available in the demo" },
            { status: 403 },
          ),
        ),
      navigate: () => undefined,
    });

    const listed = await authClient.oauth.accounts();
    const unlinked = await authClient.oauth.unlink("github");

    expect(listed.error?.code).toBe("forbidden");
    expect(unlinked.error?.code).toBe("forbidden");
  });
});

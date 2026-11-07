import { describe, expect, test } from "vitest";

import type { User } from "../../db/schema/users.js";
import type { FetchOptions } from "../../test/request.js";
import type { TestSite } from "../../test/site.js";
import { fakeMail } from "../../test/mail-fake.js";
import { testSite } from "../../test/site.js";
import { createAuthClient } from "./auth-client.js";

const site = await testSite({ plugins: [] });
const emailSite = await testSite({
  plugins: [],
  config: {
    mailer: fakeMail(),
    auth: { magicLink: { siteName: "Test Site" } },
  },
});

/** An auth client signed in as `user`, whose every request reaches the site's real handlers. */
function clientOf(on: TestSite, user: User) {
  const signedIn = on.actingAs(user);
  return createAuthClient({
    basePath: () => "",
    fetch: async (url, init) => {
      const page = await signedIn.visit(url, {
        method: init.method as FetchOptions["method"],
        headers: init.headers,
        body: init.body ?? undefined,
      });
      return new Response(page.body === "" ? null : page.body, {
        status: page.status,
        headers: page.headers,
      });
    },
    navigate: () => undefined,
  }).authClient;
}

async function signedInClient(on: TestSite = site) {
  const user = await on.factory.member.create();
  return { user, authClient: clientOf(on, user) };
}

describe("authClient.oauth.accounts and unlink", () => {
  test("a user with a passkey lists a linked provider and unlinks it", async () => {
    const { user, authClient } = await signedInClient();
    await site.factory.credential.create({
      userId: user.id,
      publicKey: Buffer.from([1, 2, 3]),
    });
    await site.factory.oauthAccount.create({
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
    const { user, authClient } = await signedInClient();
    await site.factory.oauthAccount.create({
      userId: user.id,
      provider: "github",
    });

    const result = await authClient.oauth.unlink("github");

    expect(result.error?.code).toBe("last_sign_in_method");
    expect(result.error?.message.id).toBe("authClient.error.lastSignInMethod");
    expect((await authClient.oauth.accounts()).data).toHaveLength(1);
  });

  test("an only link unlinks on a site that signs in by email", async () => {
    const { user, authClient } = await signedInClient(emailSite);
    await emailSite.factory.oauthAccount.create({
      userId: user.id,
      provider: "github",
    });

    const result = await authClient.oauth.unlink("github");

    expect(result.error).toBeNull();
    expect((await authClient.oauth.accounts()).data).toEqual([]);
  });

  test("two concurrent unlinks of the last two providers can't both succeed", async () => {
    const { user, authClient } = await signedInClient();
    await site.factory.oauthAccount.create({
      userId: user.id,
      provider: "github",
    });
    await site.factory.oauthAccount.create({
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
    const { user, authClient } = await signedInClient();
    await site.factory.credential.create({
      userId: user.id,
      publicKey: Buffer.from([1, 2, 3]),
    });
    const other = await site.factory.member.create();
    await site.factory.credential.create({
      userId: other.id,
      publicKey: Buffer.from([4, 5, 6]),
    });
    await site.factory.oauthAccount.create({
      userId: other.id,
      provider: "github",
    });
    const theirs = clientOf(site, other);

    const listed = await authClient.oauth.accounts();
    const unlinked = await authClient.oauth.unlink("github");

    expect(listed.data).toEqual([]);
    expect(unlinked.error?.code).toBe("not_found");
    expect((await theirs.oauth.accounts()).data).toHaveLength(1);
  });

  test("a runtime that refuses oauthLinking resolves forbidden", async () => {
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

  test.each([
    ["an answer that is not an RPC envelope", {}],
    ["a list that is not a list of accounts", { json: { provider: "github" } }],
  ])("accounts resolves unknown on %s", async (_name, body) => {
    const { authClient } = createAuthClient({
      basePath: () => "",
      fetch: () => Promise.resolve(Response.json(body)),
      navigate: () => undefined,
    });

    const listed = await authClient.oauth.accounts();

    expect(listed.error?.code).toBe("unknown");
    expect(listed.data).toBeNull();
  });

  test.each([
    ["an answer that is not an RPC envelope", {}],
    ["an unlink that names no provider", { json: {} }],
  ])("unlink resolves unknown on %s", async (_name, body) => {
    const { authClient } = createAuthClient({
      basePath: () => "",
      fetch: () => Promise.resolve(Response.json(body)),
      navigate: () => undefined,
    });

    const unlinked = await authClient.oauth.unlink("github");

    expect(unlinked.error?.code).toBe("unknown");
    expect(unlinked.data).toBeNull();
  });
});

import { beforeEach, describe, expect, test } from "vitest";

import {
  findOAuthGrant,
  issueRefreshToken,
  saveOAuthGrant,
} from "../../src/auth/oauth-server/grants.js";
import { eq } from "../../src/db/index.js";
import { oauthRefreshTokens } from "../../src/db/schema/oauth_refresh_tokens.js";
import { testSite } from "../../src/test/site.js";
import {
  approve,
  authorizationParams,
  blog,
  callTool,
  CLIENT_ID,
  exchange,
  MCP_URL,
  pkce,
  refresh,
  serveClientDocument,
  tokenPair,
} from "../support/mcp-client.js";

const site = await testSite({
  plugins: [blog],
  config: { mcp: { enabled: true } },
});
/** Its own config, so its own cache: a refresh on it fetches the client's document. */
const offline = await testSite({
  plugins: [blog],
  config: { mcp: { enabled: true } },
});

beforeEach(() => {
  serveClientDocument(site);
});

describe("refreshing an access token", () => {
  test("a code exchange returns a refresh token", async () => {
    const first = await tokenPair(site, await site.factory.editor.create());

    expect(first.refresh_token).toEqual(expect.any(String));
  });

  test("returns a new pair", async () => {
    const first = await tokenPair(site, await site.factory.editor.create());

    const { status, body } = await refresh(site, first.refresh_token);

    expect(status).toBe(200);
    expect(body).toMatchObject({ token_type: "Bearer", expires_in: 3600 });
    expect(body.refresh_token).toEqual(expect.any(String));
    expect(body.refresh_token).not.toBe(first.refresh_token);
    expect(body.access_token).not.toBe(first.access_token);
  });

  test("returns an access token that calls an MCP tool", async () => {
    const first = await tokenPair(site, await site.factory.editor.create());
    const { body } = await refresh(site, first.refresh_token);

    const call = await callTool(
      site,
      body.access_token as string,
      "content_create",
      { type: "post", slug: "hello", title: "Hello" },
    );

    expect(call.result?.isError).toBeUndefined();
  });

  test("stores a refresh token only as its hash", async () => {
    const { refresh_token } = await tokenPair(
      site,
      await site.factory.editor.create(),
    );

    const rows = await site.context.db.select().from(oauthRefreshTokens);

    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(refresh_token);
  });

  test("carries only what the grant still holds after a narrower consent", async () => {
    const user = await site.factory.editor.create();
    const { refresh_token } = await tokenPair(site, user);
    const narrowParams = authorizationParams(await pkce(), { scope: "draft" });
    const offered = await site
      .actingAs(user)
      .rpc.auth.oauthConsent.lookup(narrowParams);
    await approve(
      site,
      user,
      narrowParams,
      offered.capabilities.filter(
        (capability) => capability !== "entry:post:create",
      ),
    );

    const { body } = await refresh(site, refresh_token);
    const created = await callTool(
      site,
      body.access_token as string,
      "content_create",
      { type: "post", slug: "hello", title: "Hello" },
    );

    expect(created.result?._meta?.code).toBe("forbidden");
  });
});

describe("reusing a rotated refresh token", () => {
  test("is invalid_grant", async () => {
    const first = await tokenPair(site, await site.factory.editor.create());
    await refresh(site, first.refresh_token);

    const reused = await refresh(site, first.refresh_token);

    expect(reused).toEqual({ status: 400, body: { error: "invalid_grant" } });
  });

  test("revokes the grant's latest refresh token", async () => {
    const first = await tokenPair(site, await site.factory.editor.create());
    const { body } = await refresh(site, first.refresh_token);
    await refresh(site, first.refresh_token);

    const latest = await refresh(site, body.refresh_token as string);

    expect(latest.body).toEqual({ error: "invalid_grant" });
  });

  test("revokes the grant's access tokens", async () => {
    const first = await tokenPair(site, await site.factory.editor.create());
    const { body } = await refresh(site, first.refresh_token);
    await refresh(site, first.refresh_token);

    const calls = await Promise.all(
      [first.access_token, body.access_token as string].map((token) =>
        callTool(site, token, "content_create", {
          type: "post",
          slug: "hello",
          title: "Hello",
        }),
      ),
    );

    expect(calls.map((call) => call.status)).toEqual([401, 401]);
  });
});

describe("a refused refresh", () => {
  test("presented by another client is invalid_grant", async () => {
    const { refresh_token } = await tokenPair(
      site,
      await site.factory.editor.create(),
    );

    const { status, body } = await exchange(site, {
      grant_type: "refresh_token",
      refresh_token,
      client_id: "https://other.example/client.json",
    });

    expect(status).toBe(400);
    expect(body).toEqual({ error: "invalid_grant" });
  });

  test("naming a resource other than the MCP URL is invalid_target", async () => {
    const { refresh_token } = await tokenPair(
      site,
      await site.factory.editor.create(),
    );

    const { status, body } = await exchange(site, {
      grant_type: "refresh_token",
      refresh_token,
      client_id: CLIENT_ID,
      resource: "https://cms.example/_plumix/rpc",
    });

    expect(status).toBe(400);
    expect(body).toEqual({ error: "invalid_target" });
  });

  test("by another client leaves the token valid for its own", async () => {
    const { refresh_token } = await tokenPair(
      site,
      await site.factory.editor.create(),
    );
    await exchange(site, {
      grant_type: "refresh_token",
      refresh_token,
      client_id: "https://other.example/client.json",
    });

    const { status } = await refresh(site, refresh_token);

    expect(status).toBe(200);
  });

  test("for its resource leaves the token valid", async () => {
    const { refresh_token } = await tokenPair(
      site,
      await site.factory.editor.create(),
    );
    await exchange(site, {
      grant_type: "refresh_token",
      refresh_token,
      client_id: CLIENT_ID,
      resource: "https://cms.example/_plumix/rpc",
    });

    const { status } = await refresh(site, refresh_token);

    expect(status).toBe(200);
  });

  // A fetch route answers the same all test, so the token is issued to the
  // database and its row read back, not refreshed once reachable again.
  test("while the client's metadata is unreachable is 401 and leaves the token unspent", async () => {
    offline.fetch.route("GET", CLIENT_ID, "network error");
    const user = await offline.factory.editor.create();
    const { db } = offline.context;
    await saveOAuthGrant(db, {
      userId: user.id,
      clientId: CLIENT_ID,
      scopes: ["entry:post:read"],
    });
    const grant = await findOAuthGrant(db, user.id, CLIENT_ID);
    const token = await issueRefreshToken(db, {
      grantId: grant?.id ?? 0,
      resource: MCP_URL,
      scopes: ["entry:post:read"],
    });

    const unreachable = await refresh(offline, token);

    const [row] = await db
      .select()
      .from(oauthRefreshTokens)
      .where(eq(oauthRefreshTokens.grantId, grant?.id ?? 0));
    expect(unreachable.status).toBe(401);
    expect(row?.rotatedAt).toBeNull();
  });
});

describe("a refresh token's lifetime", () => {
  test("ends after thirty days, as invalid_grant", async () => {
    site.freezeTime("2026-11-01T10:00:00Z");
    const { refresh_token } = await tokenPair(
      site,
      await site.factory.editor.create(),
    );

    site.freezeTime("2026-12-01T10:00:01Z");
    const { status, body } = await refresh(site, refresh_token);

    expect(status).toBe(400);
    expect(body).toEqual({ error: "invalid_grant" });
  });

  test("still holds inside its thirty days", async () => {
    site.freezeTime("2026-11-01T10:00:00Z");
    const { refresh_token } = await tokenPair(
      site,
      await site.factory.editor.create(),
    );

    site.travel({ days: 29 });
    const { status } = await refresh(site, refresh_token);

    expect(status).toBe(200);
  });
});

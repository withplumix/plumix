import { beforeEach, describe, expect, test } from "vitest";

import type { ToolCallResult } from "../support/mcp-client.js";
import { testSite } from "../../src/test/site.js";
import {
  approve,
  authorizationParams,
  authorize,
  blog,
  callTool,
  connect,
  exchange,
  exchangeForm,
  locationOf,
  pkce,
  REDIRECT_URI,
  serveClientDocument,
} from "../support/mcp-client.js";

const site = await testSite({
  plugins: [blog],
  config: { mcp: { enabled: true } },
});

beforeEach(() => {
  serveClientDocument(site);
});

describe("consent", () => {
  test("can't be approved with a bearer token, only with a session", async () => {
    const user = await site.factory.editor.create();
    const { secret } = await site.factory.apiToken.create({ userId: user.id });
    const params = authorizationParams(await pkce());

    const page = await site.visit("/_plumix/rpc/auth/oauthConsent/approve", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ json: params }),
    });

    expect(page.status).toBe(401);
  });

  test("is skipped when the person's grant to the client covers the scope", async () => {
    const user = await site.factory.editor.create();
    await connect(site, user, { scope: "draft" });
    const keys = await pkce();

    const location = locationOf(
      await authorize(site, authorizationParams(keys, { scope: "read" }), user),
    );
    const { status } = await exchange(
      site,
      exchangeForm(location.searchParams.get("code") ?? "", keys),
    );

    expect(location.origin + location.pathname).toBe(REDIRECT_URI);
    expect(location.searchParams.get("iss")).toBe("https://cms.example");
    expect(status).toBe(200);
  });

  test("is asked again when the client asks for more than was granted", async () => {
    const user = await site.factory.editor.create();
    await connect(site, user, { scope: "draft" });

    const location = locationOf(
      await authorize(
        site,
        authorizationParams(await pkce(), { scope: "full" }),
        user,
      ),
    );

    expect(location.pathname).toBe("/_plumix/admin/auth/authorize");
  });

  test("is asked again when a narrowed grant misses part of the scope", async () => {
    const user = await site.factory.editor.create();
    await connect(site, user, {
      scope: "read",
      capabilities: ["entry:post:read"],
    });

    const location = locationOf(
      await authorize(
        site,
        authorizationParams(await pkce(), { scope: "read" }),
        user,
      ),
    );

    expect(location.pathname).toBe("/_plumix/admin/auth/authorize");
  });

  test("isn't skipped for another person's grant", async () => {
    await connect(site, await site.factory.editor.create(), { scope: "draft" });

    const location = locationOf(
      await authorize(
        site,
        authorizationParams(await pkce(), { scope: "draft" }),
        await site.factory.editor.create(),
      ),
    );

    expect(location.pathname).toBe("/_plumix/admin/auth/authorize");
  });

  test("names the client, its host and the requested scope's capabilities", async () => {
    const user = await site.factory.editor.create();
    const params = authorizationParams(await pkce(), { scope: "read" });

    const lookup = await site
      .actingAs(user)
      .rpc.auth.oauthConsent.lookup(params);

    expect(lookup.client).toEqual({
      name: "Example Agent",
      host: "agent.example",
      logoUri: null,
      loopbackOnly: false,
    });
    expect(lookup.scope).toBe("read");
    expect(lookup.capabilities).toContain("entry:post:read");
    expect(lookup.capabilities).not.toContain("entry:post:create");
  });

  test("tells a person who signed in mid-flow that their grant already covers the request", async () => {
    const user = await site.factory.editor.create();
    await connect(site, user, { scope: "draft" });
    const covered = async (scope: string) =>
      (
        await site
          .actingAs(user)
          .rpc.auth.oauthConsent.lookup(
            authorizationParams(await pkce(), { scope }),
          )
      ).covered;

    expect(await covered("read")).toBe(true);
    expect(await covered("full")).toBe(false);
  });

  test("answers a covered request sent back to /authorize after sign-in with a code", async () => {
    const user = await site.factory.editor.create();
    await connect(site, user, { scope: "draft" });
    const params = authorizationParams(await pkce(), { scope: "draft" });
    const signedOut = locationOf(await authorize(site, params));

    const signedIn = locationOf(
      await authorize(site, Object.fromEntries(signedOut.searchParams), user),
    );

    expect(signedOut.pathname).toBe("/_plumix/admin/auth/authorize");
    expect(signedIn.origin + signedIn.pathname).toBe(REDIRECT_URI);
    expect(signedIn.searchParams.get("code")).not.toBeNull();
  });

  test("flags a client whose every redirect is loopback", async () => {
    // Its own client, since the site caches each client's document.
    const clientId = "https://loopback.example/client.json";
    site.fetch.route(
      "GET",
      clientId,
      Response.json({
        client_id: clientId,
        redirect_uris: ["http://127.0.0.1/callback"],
      }),
    );
    const user = await site.factory.editor.create();
    const params = authorizationParams(await pkce(), {
      client_id: clientId,
      redirect_uri: "http://localhost:53682/callback",
    });

    const lookup = await site
      .actingAs(user)
      .rpc.auth.oauthConsent.lookup(params);

    expect(lookup.client.loopbackOnly).toBe(true);
  });

  test("denied sends the client access_denied with the state and issuer", async () => {
    const user = await site.factory.editor.create();
    const params = authorizationParams(await pkce());

    const { redirectTo } = await site
      .actingAs(user)
      .rpc.auth.oauthConsent.deny(params);

    const location = new URL(redirectTo);
    expect(location.origin + location.pathname).toBe(REDIRECT_URI);
    expect(Object.fromEntries(location.searchParams)).toEqual({
      error: "access_denied",
      state: "xyz",
      iss: "https://cms.example",
    });
  });
});

interface Written {
  readonly id: number;
  readonly etag: string;
}

function written(call: { result: ToolCallResult | undefined }): Written {
  return JSON.parse(call.result?.content[0]?.text ?? "null") as Written;
}

describe("what a grant's token can do", () => {
  test("a draft grant's token updates a draft and is refused publishing", async () => {
    const token = await connect(site, await site.factory.editor.create(), {
      scope: "draft",
    });
    const draft = written(
      await callTool(site, token, "content_create", {
        type: "post",
        slug: "draft",
        title: "Draft",
      }),
    );

    const updated = await callTool(site, token, "content_update", {
      type: "post",
      id: draft.id,
      ifMatch: draft.etag,
      title: "Edited",
    });
    const published = await callTool(site, token, "content_publish", {
      type: "post",
      id: draft.id,
      ifMatch: written(updated).etag,
    });

    expect(updated.result?.isError).toBeUndefined();
    expect(published.result?._meta?.code).toBe("forbidden");
  });

  test("a grant narrowed at consent holds only the capabilities kept", async () => {
    const user = await site.factory.editor.create();
    const keys = await pkce();
    const params = authorizationParams(keys, { scope: "draft" });
    const offered = await site
      .actingAs(user)
      .rpc.auth.oauthConsent.lookup(params);
    const kept = offered.capabilities.filter(
      (capability) => capability !== "entry:post:create",
    );
    const redirect = await approve(site, user, params, kept);
    const { body } = await exchange(
      site,
      exchangeForm(redirect.searchParams.get("code") ?? "", keys),
    );

    const created = await callTool(
      site,
      body.access_token as string,
      "content_create",
      { type: "post", slug: "draft", title: "Draft" },
    );

    expect(offered.capabilities).toContain("entry:post:create");
    expect(created.result?._meta?.code).toBe("forbidden");
  });
});

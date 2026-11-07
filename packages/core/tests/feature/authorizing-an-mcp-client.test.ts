import { beforeEach, describe, expect, test } from "vitest";

import { testSite } from "../../src/test/site.js";
import {
  approve,
  authorizationParams,
  authorize,
  blog,
  callTool,
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
const underBlog = await testSite({
  plugins: [blog],
  config: { mcp: { enabled: true }, basePath: "/blog" },
});

beforeEach(() => {
  serveClientDocument(site);
  serveClientDocument(underBlog);
});

describe("authorizing a client", () => {
  test("sends a signed-in person without a grant to the consent page with the request", async () => {
    const user = await site.factory.editor.create();
    const params = authorizationParams(await pkce());

    const page = await authorize(site, params, user);

    const location = locationOf(page);
    expect(page.status).toBe(302);
    expect(location.origin + location.pathname).toBe(
      "https://cms.example/_plumix/admin/auth/authorize",
    );
    expect(Object.fromEntries(location.searchParams)).toEqual(params);
  });

  test("sends a signed-out person to the consent page, which signs them in first", async () => {
    const page = await authorize(site, authorizationParams(await pkce()));

    expect(locationOf(page).pathname).toBe("/_plumix/admin/auth/authorize");
  });

  test("under a base path names the mounted MCP URL and goes to the mounted consent page", async () => {
    const user = await underBlog.factory.editor.create();
    const params = authorizationParams(await pkce(), {
      resource: "https://cms.example/blog/_plumix/mcp",
    });

    const page = await underBlog
      .actingAs(user)
      .visit(
        `/blog/_plumix/oauth/authorize?${new URLSearchParams(params).toString()}`,
      );

    expect(locationOf(page).pathname).toBe(
      "/blog/_plumix/admin/auth/authorize",
    );
  });

  test("redirects an approval with a code, the state and the issuer, and the code buys a token that calls an MCP tool", async () => {
    const user = await site.factory.editor.create();
    const keys = await pkce();
    const params = authorizationParams(keys);

    const redirect = await approve(site, user, params);
    const code = redirect.searchParams.get("code");
    const { status, body } = await exchange(
      site,
      exchangeForm(code ?? "", keys),
    );
    const call = await callTool(
      site,
      body.access_token as string,
      "content_create",
      { type: "post", slug: "hello", title: "Hello" },
    );

    expect(redirect.origin + redirect.pathname).toBe(REDIRECT_URI);
    expect(redirect.searchParams.get("state")).toBe("xyz");
    expect(redirect.searchParams.get("iss")).toBe("https://cms.example");
    expect(status).toBe(200);
    expect(body).toMatchObject({ token_type: "Bearer", expires_in: 3600 });
    expect(call.result?.isError).toBeUndefined();
  });
});

describe("a refused authorization request", () => {
  test.each([
    ["the plain PKCE method", ["code_challenge_method", "plain"]],
    ["no PKCE challenge", ["code_challenge", null]],
    ["no PKCE method", ["code_challenge_method", null]],
  ] as const)(
    "with %s is sent back to the client as invalid_request",
    async (_, [key, value]) => {
      const user = await site.factory.editor.create();
      const params = authorizationParams(await pkce());
      if (value === null) delete params[key];
      else params[key] = value;

      const location = locationOf(await authorize(site, params, user));

      expect(location.origin + location.pathname).toBe(REDIRECT_URI);
      expect(Object.fromEntries(location.searchParams)).toEqual({
        error: "invalid_request",
        state: "xyz",
        iss: "https://cms.example",
      });
    },
  );

  test("naming a resource other than the MCP URL is sent back as invalid_target", async () => {
    const user = await site.factory.editor.create();
    const params = authorizationParams(await pkce(), {
      resource: "https://cms.example/_plumix/api",
    });

    const location = locationOf(await authorize(site, params, user));

    expect(location.searchParams.get("error")).toBe("invalid_target");
  });

  test("naming a redirect URI the client's document doesn't list is refused without redirecting", async () => {
    const user = await site.factory.editor.create();
    const params = authorizationParams(await pkce(), {
      redirect_uri: "https://attacker.example/callback",
    });

    const page = await authorize(site, params, user);

    expect(page.status).toBe(400);
    expect(page.headers.get("location")).toBeNull();
    expect(JSON.parse(page.body)).toEqual({ error: "invalid_request" });
  });

  test("whose PKCE method is plain can't be approved", async () => {
    const user = await site.factory.editor.create();
    const params = authorizationParams(await pkce(), {
      code_challenge_method: "plain",
    });

    const approving = site.actingAs(user).rpc.auth.oauthConsent.approve(params);

    await expect(approving).rejects.toMatchObject({ status: 400 });
  });
});

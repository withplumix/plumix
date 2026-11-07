import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { User } from "../../db/schema/users.js";
import type { DispatcherHarness } from "../../test/dispatcher.js";
import type { DefaultRole } from "../../users/contract/roles.js";
import { oauthRefreshTokens } from "../../db/schema/oauth_refresh_tokens.js";
import { encodeBase64url } from "../../encoding.js";
import { definePlugin } from "../../plugin/define.js";
import { createDispatcherHarness } from "../../test/dispatcher.js";
import { buildRequest } from "../../test/request.js";

const blog = definePlugin("test-blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      supports: ["title", "editor"],
    });
  },
});

function mcpHarness(
  options: Parameters<typeof createDispatcherHarness>[0] = {},
): Promise<DispatcherHarness> {
  return createDispatcherHarness({
    ...options,
    config: { mcp: { enabled: true }, plugins: [blog], ...options.config },
  });
}

const CLIENT_ID = "https://agent.example/oauth/client.json";
const REDIRECT_URI = "https://agent.example/callback";
const MCP_URL = "https://cms.example/_plumix/mcp";

const CLIENT_DOCUMENT = {
  client_id: CLIENT_ID,
  client_name: "Example Agent",
  redirect_uris: [REDIRECT_URI],
};

/** Serves the client's metadata document; every other URL is unreachable. */
beforeEach(() => {
  vi.stubGlobal("fetch", (input: string | URL) =>
    Promise.resolve(
      input.toString() === CLIENT_ID
        ? Response.json(CLIENT_DOCUMENT)
        : new Response(null, { status: 404 }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

interface Pkce {
  readonly verifier: string;
  readonly challenge: string;
}

async function pkce(): Promise<Pkce> {
  const verifier = encodeBase64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return { verifier, challenge: encodeBase64url(new Uint8Array(digest)) };
}

type AuthorizationParams = Record<string, string>;

function authorizationParams(
  { challenge }: Pkce,
  overrides: AuthorizationParams = {},
): AuthorizationParams {
  return {
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: "full",
    state: "xyz",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: MCP_URL,
    ...overrides,
  };
}

/** The client sends the person's browser here, carrying their session. */
async function authorize(
  h: DispatcherHarness,
  params: AuthorizationParams,
  as: User | null = null,
): Promise<Response> {
  return h.dispatch(
    await buildRequest(
      h.db,
      `/_plumix/oauth/authorize?${new URLSearchParams(params).toString()}`,
      { as, withCsrfHeader: false },
    ),
  );
}

function locationOf(res: Response): URL {
  return new URL(res.headers.get("location") ?? "about:blank");
}

async function consentRpc<T>(
  h: DispatcherHarness,
  procedure: "lookup" | "approve" | "deny",
  input: Record<string, unknown>,
  init: { as?: User; headers?: HeadersInit } = {},
): Promise<{ status: number; body: T }> {
  const res = await h.dispatch(
    await buildRequest(h.db, `/_plumix/rpc/auth/oauthConsent/${procedure}`, {
      json: { json: input },
      ...init,
    }),
  );
  const body = (await res.json()) as { json: T };
  return { status: res.status, body: body.json };
}

async function approve(
  h: DispatcherHarness,
  user: User,
  params: AuthorizationParams,
  capabilities?: readonly string[],
): Promise<URL> {
  const { status, body } = await consentRpc<{ redirectTo: string }>(
    h,
    "approve",
    { ...params, ...(capabilities ? { capabilities } : {}) },
    { as: user },
  );
  expect(status).toBe(200);
  return new URL(body.redirectTo);
}

async function exchange(
  h: DispatcherHarness,
  form: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await h.dispatch(
    new Request(`https://cms.example/_plumix/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form),
    }),
  );
  return {
    status: res.status,
    body: (await res.json()) as Record<string, unknown>,
  };
}

function exchangeForm(
  code: string,
  { verifier }: Pkce,
  overrides: Record<string, string> = {},
): Record<string, string> {
  return {
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: verifier,
    resource: MCP_URL,
    ...overrides,
  };
}

/** Consent approved as `user`, then the code exchanged: the access token. */
async function connect(
  h: DispatcherHarness,
  user: User,
  {
    scope = "full",
    capabilities,
  }: { scope?: string; capabilities?: readonly string[] } = {},
): Promise<string> {
  const keys = await pkce();
  const params = authorizationParams(keys, { scope });
  const redirect = await approve(h, user, params, capabilities);
  const code = redirect.searchParams.get("code") ?? "";
  const { body } = await exchange(h, exchangeForm(code, keys));
  return body.access_token as string;
}

interface ToolCallResult {
  readonly content: readonly { readonly type: string; readonly text: string }[];
  readonly isError?: boolean;
  readonly _meta?: { readonly code?: string };
}

async function callTool(
  h: DispatcherHarness,
  token: string,
  name: string,
  args: Record<string, unknown>,
): Promise<{ status: number; result: ToolCallResult | undefined }> {
  const res = await h.dispatch(
    new Request(MCP_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  );
  if (res.status !== 200) return { status: res.status, result: undefined };
  const body = (await res.json()) as { result: ToolCallResult };
  return { status: res.status, result: body.result };
}

function seed(
  h: DispatcherHarness,
  role: DefaultRole = "editor",
): Promise<User> {
  return h.factory.user.create({ role });
}

describe("authorization-server metadata", () => {
  test("advertises the endpoints, the refresh grant, CIMD, public clients, S256 and the three scopes", async () => {
    const h = await mcpHarness();

    const res = await h.dispatch(
      new Request("https://cms.example/.well-known/oauth-authorization-server"),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      issuer: "https://cms.example",
      authorization_endpoint: "https://cms.example/_plumix/oauth/authorize",
      token_endpoint: "https://cms.example/_plumix/oauth/token",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["read", "draft", "full"],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    });
  });

  test.each([
    "https://cms.example/.well-known/oauth-authorization-server/blog",
    "https://cms.example/.well-known/oauth-authorization-server",
  ])("under a base path, %s names the mounted issuer", async (url) => {
    const h = await mcpHarness({ config: { basePath: "/blog" } });

    const res = await h.dispatch(new Request(url));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      issuer: "https://cms.example/blog",
      authorization_endpoint:
        "https://cms.example/blog/_plumix/oauth/authorize",
      token_endpoint: "https://cms.example/blog/_plumix/oauth/token",
    });
  });

  test("a site with MCP off advertises no authorization server", async () => {
    const h = await createDispatcherHarness();

    const res = await h.dispatch(
      new Request("https://cms.example/.well-known/oauth-authorization-server"),
    );

    expect(res.status).toBe(404);
  });
});

describe("authorizing a client", () => {
  test("a signed-in person without a grant is sent to the consent page with the request", async () => {
    const h = await mcpHarness();
    const user = await seed(h);
    const params = authorizationParams(await pkce());

    const res = await authorize(h, params, user);

    const location = locationOf(res);
    expect(res.status).toBe(302);
    expect(location.origin + location.pathname).toBe(
      "https://cms.example/_plumix/admin/auth/authorize",
    );
    expect(Object.fromEntries(location.searchParams)).toEqual(params);
  });

  test("a signed-out person is sent to the consent page, which signs them in first", async () => {
    const h = await mcpHarness();

    const res = await authorize(h, authorizationParams(await pkce()));

    expect(locationOf(res).pathname).toBe("/_plumix/admin/auth/authorize");
  });

  test("under a base path the request names the mounted MCP URL and goes to the mounted consent page", async () => {
    const h = await mcpHarness({ config: { basePath: "/blog" } });
    const params = authorizationParams(await pkce(), {
      resource: "https://cms.example/blog/_plumix/mcp",
    });

    const res = await h.dispatch(
      await buildRequest(
        h.db,
        `/blog/_plumix/oauth/authorize?${new URLSearchParams(params).toString()}`,
        { as: await seed(h), withCsrfHeader: false },
      ),
    );

    expect(locationOf(res).pathname).toBe("/blog/_plumix/admin/auth/authorize");
  });

  test("approval redirects with a code, the state and the issuer, and the code buys a token that calls an MCP tool", async () => {
    const h = await mcpHarness();
    const user = await seed(h);
    const keys = await pkce();
    const params = authorizationParams(keys);

    const redirect = await approve(h, user, params);
    const code = redirect.searchParams.get("code");
    const { status, body } = await exchange(h, exchangeForm(code ?? "", keys));
    const call = await callTool(
      h,
      body.access_token as string,
      "content_create",
      {
        type: "post",
        slug: "hello",
        title: "Hello",
      },
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
    "%s is sent back to the client as invalid_request",
    async (_, [key, value]) => {
      const h = await mcpHarness();
      const user = await seed(h);
      const params = authorizationParams(await pkce());
      if (value === null) delete params[key];
      else params[key] = value;

      const location = locationOf(await authorize(h, params, user));

      expect(location.origin + location.pathname).toBe(REDIRECT_URI);
      expect(Object.fromEntries(location.searchParams)).toEqual({
        error: "invalid_request",
        state: "xyz",
        iss: "https://cms.example",
      });
    },
  );

  test("a resource other than the MCP URL is sent back as invalid_target", async () => {
    const h = await mcpHarness();
    const params = authorizationParams(await pkce(), {
      resource: "https://cms.example/_plumix/api",
    });

    const location = locationOf(await authorize(h, params, await seed(h)));

    expect(location.searchParams.get("error")).toBe("invalid_target");
  });

  test("a redirect URI the client's document doesn't list is refused without redirecting", async () => {
    const h = await mcpHarness();
    const params = authorizationParams(await pkce(), {
      redirect_uri: "https://attacker.example/callback",
    });

    const res = await authorize(h, params, await seed(h));

    expect(res.status).toBe(400);
    expect(res.headers.get("location")).toBeNull();
    expect(await res.json()).toEqual({ error: "invalid_request" });
  });

  test("approving a request whose PKCE method is plain is refused", async () => {
    const h = await mcpHarness();
    const params = authorizationParams(await pkce(), {
      code_challenge_method: "plain",
    });

    const { status } = await consentRpc(h, "approve", params, {
      as: await seed(h),
    });

    expect(status).toBe(400);
  });
});

describe("a refused code exchange", () => {
  async function codeFor(h: DispatcherHarness, keys: Pkce): Promise<string> {
    const redirect = await approve(h, await seed(h), authorizationParams(keys));
    return redirect.searchParams.get("code") ?? "";
  }

  test("a wrong PKCE verifier is invalid_grant", async () => {
    const h = await mcpHarness();
    const keys = await pkce();
    const code = await codeFor(h, keys);

    const { status, body } = await exchange(
      h,
      exchangeForm(code, await pkce()),
    );

    expect(status).toBe(400);
    expect(body).toEqual({ error: "invalid_grant" });
  });

  test("a redirect URI other than the one the code was issued for is invalid_grant", async () => {
    const h = await mcpHarness();
    const keys = await pkce();
    const code = await codeFor(h, keys);

    const { body } = await exchange(
      h,
      exchangeForm(code, keys, {
        redirect_uri: "https://agent.example/other",
      }),
    );

    expect(body).toEqual({ error: "invalid_grant" });
  });

  test("a resource other than the MCP URL is invalid_target", async () => {
    const h = await mcpHarness();
    const keys = await pkce();
    const code = await codeFor(h, keys);

    const { body } = await exchange(
      h,
      exchangeForm(code, keys, { resource: "https://cms.example/_plumix/api" }),
    );

    expect(body).toEqual({ error: "invalid_target" });
  });

  test("a code used once is invalid_grant the second time", async () => {
    const h = await mcpHarness();
    const keys = await pkce();
    const code = await codeFor(h, keys);
    await exchange(h, exchangeForm(code, keys));

    const { status, body } = await exchange(h, exchangeForm(code, keys));

    expect(status).toBe(400);
    expect(body).toEqual({ error: "invalid_grant" });
  });

  test("a code older than ten minutes is invalid_grant", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const h = await mcpHarness();
      const keys = await pkce();
      const code = await codeFor(h, keys);

      vi.advanceTimersByTime(10 * 60_000 + 1_000);
      const { body } = await exchange(h, exchangeForm(code, keys));

      expect(body).toEqual({ error: "invalid_grant" });
    } finally {
      vi.useRealTimers();
    }
  });

  test("a code still inside its ten minutes is exchanged", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const h = await mcpHarness();
      const keys = await pkce();
      const code = await codeFor(h, keys);

      vi.advanceTimersByTime(9 * 60_000);
      const { status } = await exchange(h, exchangeForm(code, keys));

      expect(status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a JSON body is invalid_request", async () => {
    const h = await mcpHarness();

    const res = await h.dispatch(
      new Request("https://cms.example/_plumix/oauth/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grant_type: "authorization_code" }),
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
  });
});

describe("refreshing", () => {
  interface TokenPair {
    readonly access_token: string;
    readonly refresh_token: string;
  }

  async function tokenPair(
    h: DispatcherHarness,
    user: User,
  ): Promise<TokenPair> {
    const keys = await pkce();
    const redirect = await approve(h, user, authorizationParams(keys));
    const code = redirect.searchParams.get("code") ?? "";
    const { body } = await exchange(h, exchangeForm(code, keys));
    return body as unknown as TokenPair;
  }

  function refresh(
    h: DispatcherHarness,
    refreshToken: string,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    return exchange(h, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    });
  }

  test("a code exchange returns a refresh token", async () => {
    const h = await mcpHarness();

    const first = await tokenPair(h, await seed(h));

    expect(first.refresh_token).toEqual(expect.any(String));
  });

  test("refreshing returns a new pair", async () => {
    const h = await mcpHarness();
    const first = await tokenPair(h, await seed(h));

    const { status, body } = await refresh(h, first.refresh_token);

    expect(status).toBe(200);
    expect(body).toMatchObject({ token_type: "Bearer", expires_in: 3600 });
    expect(body.refresh_token).toEqual(expect.any(String));
    expect(body.refresh_token).not.toBe(first.refresh_token);
    expect(body.access_token).not.toBe(first.access_token);
  });

  test("the access token a refresh returns calls an MCP tool", async () => {
    const h = await mcpHarness();
    const first = await tokenPair(h, await seed(h));
    const { body } = await refresh(h, first.refresh_token);

    const call = await callTool(
      h,
      body.access_token as string,
      "content_create",
      { type: "post", slug: "hello", title: "Hello" },
    );

    expect(call.result?.isError).toBeUndefined();
  });

  test("reusing a rotated refresh token is invalid_grant", async () => {
    const h = await mcpHarness();
    const first = await tokenPair(h, await seed(h));
    await refresh(h, first.refresh_token);

    const reused = await refresh(h, first.refresh_token);

    expect(reused).toEqual({ status: 400, body: { error: "invalid_grant" } });
  });

  test("reusing a rotated refresh token revokes the grant's latest refresh token", async () => {
    const h = await mcpHarness();
    const first = await tokenPair(h, await seed(h));
    const { body } = await refresh(h, first.refresh_token);
    await refresh(h, first.refresh_token);

    const latest = await refresh(
      h,
      (body as unknown as TokenPair).refresh_token,
    );

    expect(latest.body).toEqual({ error: "invalid_grant" });
  });

  test("reusing a rotated refresh token revokes the grant's access tokens", async () => {
    const h = await mcpHarness();
    const first = await tokenPair(h, await seed(h));
    const { body } = await refresh(h, first.refresh_token);
    await refresh(h, first.refresh_token);

    const calls = await Promise.all(
      [first.access_token, (body as unknown as TokenPair).access_token].map(
        (token) =>
          callTool(h, token, "content_create", {
            type: "post",
            slug: "hello",
            title: "Hello",
          }),
      ),
    );

    expect(calls.map((call) => call.status)).toEqual([401, 401]);
  });

  test("a refresh token presented by another client is invalid_grant", async () => {
    const h = await mcpHarness();
    const { refresh_token } = await tokenPair(h, await seed(h));

    const { status, body } = await exchange(h, {
      grant_type: "refresh_token",
      refresh_token,
      client_id: "https://other.example/client.json",
    });

    expect(status).toBe(400);
    expect(body).toEqual({ error: "invalid_grant" });
  });

  test("a resource other than the MCP URL is invalid_target", async () => {
    const h = await mcpHarness();
    const { refresh_token } = await tokenPair(h, await seed(h));

    const { status, body } = await exchange(h, {
      grant_type: "refresh_token",
      refresh_token,
      client_id: CLIENT_ID,
      resource: "https://cms.example/_plumix/rpc",
    });

    expect(status).toBe(400);
    expect(body).toEqual({ error: "invalid_target" });
  });

  test("a refresh token presented by another client stays valid for its own", async () => {
    const h = await mcpHarness();
    const { refresh_token } = await tokenPair(h, await seed(h));
    await exchange(h, {
      grant_type: "refresh_token",
      refresh_token,
      client_id: "https://other.example/client.json",
    });

    const { status } = await refresh(h, refresh_token);

    expect(status).toBe(200);
  });

  test("a refresh token refused for its resource stays valid", async () => {
    const h = await mcpHarness();
    const { refresh_token } = await tokenPair(h, await seed(h));
    await exchange(h, {
      grant_type: "refresh_token",
      refresh_token,
      client_id: CLIENT_ID,
      resource: "https://cms.example/_plumix/rpc",
    });

    const { status } = await refresh(h, refresh_token);

    expect(status).toBe(200);
  });

  test("a refresh token stays valid when the client's metadata is unreachable", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const h = await mcpHarness();
      const { refresh_token } = await tokenPair(h, await seed(h));
      vi.advanceTimersByTime(10 * 60_000);
      vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
      const unreachable = await refresh(h, refresh_token);
      vi.unstubAllGlobals();
      vi.stubGlobal("fetch", () =>
        Promise.resolve(Response.json(CLIENT_DOCUMENT)),
      );

      const { status } = await refresh(h, refresh_token);

      expect(unreachable.status).toBe(401);
      expect(status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a refresh token carries only what the grant still holds after a narrower consent", async () => {
    const h = await mcpHarness();
    const user = await seed(h);
    const { refresh_token } = await tokenPair(h, user);
    const narrowKeys = await pkce();
    const narrowParams = authorizationParams(narrowKeys, { scope: "draft" });
    const { body: offered } = await consentRpc<{ capabilities: string[] }>(
      h,
      "lookup",
      narrowParams,
      { as: user },
    );
    await approve(
      h,
      user,
      narrowParams,
      offered.capabilities.filter(
        (capability) => capability !== "entry:post:create",
      ),
    );

    const { body } = await refresh(h, refresh_token);
    const created = await callTool(
      h,
      body.access_token as string,
      "content_create",
      { type: "post", slug: "hello", title: "Hello" },
    );

    expect(created.result?._meta?.code).toBe("forbidden");
  });

  test("stores a refresh token only as its hash", async () => {
    const h = await mcpHarness();
    const { refresh_token } = await tokenPair(h, await seed(h));

    const rows = await h.db.select().from(oauthRefreshTokens);

    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(refresh_token);
  });

  test("a refresh token older than thirty days is invalid_grant", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const h = await mcpHarness();
      const { refresh_token } = await tokenPair(h, await seed(h));

      vi.advanceTimersByTime(30 * 24 * 60 * 60_000 + 1_000);
      const { status, body } = await refresh(h, refresh_token);

      expect(status).toBe(400);
      expect(body).toEqual({ error: "invalid_grant" });
    } finally {
      vi.useRealTimers();
    }
  });

  test("a refresh token still inside its thirty days is refreshed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const h = await mcpHarness();
      const { refresh_token } = await tokenPair(h, await seed(h));

      vi.advanceTimersByTime(29 * 24 * 60 * 60_000);
      const { status } = await refresh(h, refresh_token);

      expect(status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("what a grant's token can do", () => {
  interface Written {
    readonly id: number;
    readonly etag: string;
  }

  function written(call: { result: ToolCallResult | undefined }): Written {
    return JSON.parse(call.result?.content[0]?.text ?? "null") as Written;
  }

  test("a draft grant's token updates a draft and is refused publishing", async () => {
    const h = await mcpHarness();
    const token = await connect(h, await seed(h), { scope: "draft" });
    const draft = written(
      await callTool(h, token, "content_create", {
        type: "post",
        slug: "draft",
        title: "Draft",
      }),
    );

    const updated = await callTool(h, token, "content_update", {
      type: "post",
      id: draft.id,
      ifMatch: draft.etag,
      title: "Edited",
    });
    const published = await callTool(h, token, "content_publish", {
      type: "post",
      id: draft.id,
      ifMatch: written(updated).etag,
    });

    expect(updated.result?.isError).toBeUndefined();
    expect(published.result?._meta?.code).toBe("forbidden");
  });

  test("a grant narrowed at consent holds only the capabilities kept", async () => {
    const h = await mcpHarness();
    const user = await seed(h);
    const keys = await pkce();
    const params = authorizationParams(keys, { scope: "draft" });
    const { body: offered } = await consentRpc<{ capabilities: string[] }>(
      h,
      "lookup",
      params,
      { as: user },
    );
    const kept = offered.capabilities.filter(
      (capability) => capability !== "entry:post:create",
    );
    const redirect = await approve(h, user, params, kept);
    const { body } = await exchange(
      h,
      exchangeForm(redirect.searchParams.get("code") ?? "", keys),
    );

    const created = await callTool(
      h,
      body.access_token as string,
      "content_create",
      { type: "post", slug: "draft", title: "Draft" },
    );

    expect(offered.capabilities).toContain("entry:post:create");
    expect(created.result?._meta?.code).toBe("forbidden");
  });
});

describe("consent", () => {
  test("can't be approved with a bearer token, only with a session", async () => {
    const h = await mcpHarness();
    const user = await seed(h);
    const { secret } = await h.factory.apiToken.create({ userId: user.id });
    const params = authorizationParams(await pkce());

    const { status } = await consentRpc(h, "approve", params, {
      headers: { authorization: `Bearer ${secret}` },
    });

    expect(status).toBe(401);
  });

  test("is skipped when the person's grant to the client covers the scope", async () => {
    const h = await mcpHarness();
    const user = await seed(h);
    await connect(h, user, { scope: "draft" });
    const keys = await pkce();

    const location = locationOf(
      await authorize(h, authorizationParams(keys, { scope: "read" }), user),
    );
    const { status } = await exchange(
      h,
      exchangeForm(location.searchParams.get("code") ?? "", keys),
    );

    expect(location.origin + location.pathname).toBe(REDIRECT_URI);
    expect(location.searchParams.get("iss")).toBe("https://cms.example");
    expect(status).toBe(200);
  });

  test("is asked again when the client asks for more than was granted", async () => {
    const h = await mcpHarness();
    const user = await seed(h);
    await connect(h, user, { scope: "draft" });

    const location = locationOf(
      await authorize(
        h,
        authorizationParams(await pkce(), { scope: "full" }),
        user,
      ),
    );

    expect(location.pathname).toBe("/_plumix/admin/auth/authorize");
  });

  test("is asked again when a narrowed grant misses part of the scope", async () => {
    const h = await mcpHarness();
    const user = await seed(h);
    await connect(h, user, {
      scope: "read",
      capabilities: ["entry:post:read"],
    });

    const location = locationOf(
      await authorize(
        h,
        authorizationParams(await pkce(), { scope: "read" }),
        user,
      ),
    );

    expect(location.pathname).toBe("/_plumix/admin/auth/authorize");
  });

  test("isn't skipped for another person's grant", async () => {
    const h = await mcpHarness();
    await connect(h, await seed(h), { scope: "draft" });

    const location = locationOf(
      await authorize(
        h,
        authorizationParams(await pkce(), { scope: "draft" }),
        await seed(h),
      ),
    );

    expect(location.pathname).toBe("/_plumix/admin/auth/authorize");
  });

  test("names the client, its host and the requested scope's capabilities", async () => {
    const h = await mcpHarness();
    const params = authorizationParams(await pkce(), { scope: "read" });

    const { body } = await consentRpc<{
      client: Record<string, unknown>;
      scope: string;
      capabilities: string[];
    }>(h, "lookup", params, { as: await seed(h) });

    expect(body.client).toEqual({
      name: "Example Agent",
      host: "agent.example",
      logoUri: null,
      loopbackOnly: false,
    });
    expect(body.scope).toBe("read");
    expect(body.capabilities).toContain("entry:post:read");
    expect(body.capabilities).not.toContain("entry:post:create");
  });

  test("tells a person who signed in mid-flow that their grant already covers the request", async () => {
    const h = await mcpHarness();
    const user = await seed(h);
    await connect(h, user, { scope: "draft" });
    const covered = async (scope: string) =>
      (
        await consentRpc<{ covered: boolean }>(
          h,
          "lookup",
          authorizationParams(await pkce(), { scope }),
          { as: user },
        )
      ).body.covered;

    expect(await covered("read")).toBe(true);
    expect(await covered("full")).toBe(false);
  });

  test("a covered request sent back to /authorize after sign-in is answered with a code", async () => {
    const h = await mcpHarness();
    const user = await seed(h);
    await connect(h, user, { scope: "draft" });
    const params = authorizationParams(await pkce(), { scope: "draft" });
    const signedOut = locationOf(await authorize(h, params));

    const signedIn = locationOf(
      await authorize(h, Object.fromEntries(signedOut.searchParams), user),
    );

    expect(signedOut.pathname).toBe("/_plumix/admin/auth/authorize");
    expect(signedIn.origin + signedIn.pathname).toBe(REDIRECT_URI);
    expect(signedIn.searchParams.get("code")).not.toBeNull();
  });

  test("flags a client whose every redirect is loopback", async () => {
    const h = await mcpHarness();
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        Response.json({
          ...CLIENT_DOCUMENT,
          redirect_uris: ["http://127.0.0.1/callback"],
        }),
      ),
    );
    const params = authorizationParams(await pkce(), {
      redirect_uri: "http://localhost:53682/callback",
    });

    const { body } = await consentRpc<{ client: { loopbackOnly: boolean } }>(
      h,
      "lookup",
      params,
      { as: await seed(h) },
    );

    expect(body.client.loopbackOnly).toBe(true);
  });

  test("denying sends the client access_denied with the state and issuer", async () => {
    const h = await mcpHarness();
    const params = authorizationParams(await pkce());

    const { body } = await consentRpc<{ redirectTo: string }>(
      h,
      "deny",
      params,
      { as: await seed(h) },
    );

    const location = new URL(body.redirectTo);
    expect(location.origin + location.pathname).toBe(REDIRECT_URI);
    expect(Object.fromEntries(location.searchParams)).toEqual({
      error: "access_denied",
      state: "xyz",
      iss: "https://cms.example",
    });
  });
});

async function grantsRpc<T>(
  h: DispatcherHarness,
  procedure: "list" | "revoke" | "adminList" | "adminRevoke",
  input: Record<string, unknown>,
  as: User,
): Promise<{ status: number; body: T }> {
  const res = await h.dispatch(
    await buildRequest(h.db, `/_plumix/rpc/auth/oauthGrants/${procedure}`, {
      json: { json: input },
      as,
    }),
  );
  const body = (await res.json()) as { json: T };
  return { status: res.status, body: body.json };
}

interface ListedGrant {
  readonly id: number;
  readonly clientId: string;
  readonly name: string;
  readonly host: string;
  readonly capabilities: readonly string[];
  readonly lastUsedAt: string | null;
}

describe("a person's connected apps", () => {
  test("lists each client they granted with its name, host, capabilities and last use", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-11-01T10:00:00Z"));
      const h = await mcpHarness();
      const user = await seed(h);
      const token = await connect(h, user, {
        scope: "read",
        capabilities: ["entry:post:read"],
      });
      vi.setSystemTime(new Date("2026-11-01T10:30:00Z"));
      await callTool(h, token, "content_list", { type: "post" });

      const { body } = await grantsRpc<ListedGrant[]>(h, "list", {}, user);

      expect(body).toMatchObject([
        {
          clientId: CLIENT_ID,
          name: "Example Agent",
          host: "agent.example",
          capabilities: ["entry:post:read"],
          lastUsedAt: "2026-11-01T10:30:00.000Z",
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("leaves out another person's grants", async () => {
    const h = await mcpHarness();
    await connect(h, await seed(h));

    const { body } = await grantsRpc<ListedGrant[]>(
      h,
      "list",
      {},
      await seed(h),
    );

    expect(body).toEqual([]);
  });

  test("names a client by its host until it has exchanged a code", async () => {
    const h = await mcpHarness();
    const user = await seed(h);
    await approve(h, user, authorizationParams(await pkce()));

    const { body } = await grantsRpc<ListedGrant[]>(h, "list", {}, user);

    expect(body).toMatchObject([
      { name: "agent.example", host: "agent.example", lastUsedAt: null },
    ]);
  });
});

describe("revoking a connected app", () => {
  async function connectedGrant(
    h: DispatcherHarness,
    user: User,
  ): Promise<number> {
    const { body } = await grantsRpc<ListedGrant[]>(h, "list", {}, user);
    return body[0]?.id ?? 0;
  }

  test("refuses its access token at once", async () => {
    const h = await mcpHarness();
    const user = await seed(h);
    const token = await connect(h, user);
    const id = await connectedGrant(h, user);

    await grantsRpc(h, "revoke", { id }, user);

    const call = await callTool(h, token, "content_list", { type: "post" });
    expect(call.status).toBe(401);
  });

  test("answers with the revoked grant", async () => {
    const h = await mcpHarness();
    const user = await seed(h);
    await connect(h, user);
    const id = await connectedGrant(h, user);

    const revoked = await grantsRpc(h, "revoke", { id }, user);

    expect(revoked).toEqual({ status: 200, body: { id } });
  });

  test("refuses its refresh token", async () => {
    const h = await mcpHarness();
    const user = await seed(h);
    const keys = await pkce();
    const redirect = await approve(h, user, authorizationParams(keys));
    const { body: pair } = await exchange(
      h,
      exchangeForm(redirect.searchParams.get("code") ?? "", keys),
    );
    const id = await connectedGrant(h, user);

    await grantsRpc(h, "revoke", { id }, user);

    const refreshed = await exchange(h, {
      grant_type: "refresh_token",
      refresh_token: pair.refresh_token as string,
      client_id: CLIENT_ID,
    });
    expect(refreshed).toEqual({
      status: 400,
      body: { error: "invalid_grant" },
    });
  });

  test("sends the client's next authorization to consent", async () => {
    const h = await mcpHarness();
    const user = await seed(h);
    await connect(h, user);
    const id = await connectedGrant(h, user);

    await grantsRpc(h, "revoke", { id }, user);

    const location = locationOf(
      await authorize(h, authorizationParams(await pkce()), user),
    );
    expect(location.pathname).toBe("/_plumix/admin/auth/authorize");
  });

  test("drops it from the person's connected apps", async () => {
    const h = await mcpHarness();
    const user = await seed(h);
    await connect(h, user);
    const id = await connectedGrant(h, user);

    await grantsRpc(h, "revoke", { id }, user);

    const { body } = await grantsRpc<ListedGrant[]>(h, "list", {}, user);
    expect(body).toEqual([]);
  });

  test("of another person is NOT_FOUND and leaves their token working", async () => {
    const h = await mcpHarness();
    const owner = await seed(h);
    const token = await connect(h, owner);
    const id = await connectedGrant(h, owner);

    const { status } = await grantsRpc(h, "revoke", { id }, await seed(h));

    const call = await callTool(h, token, "content_list", { type: "post" });
    expect([status, call.status]).toEqual([404, 200]);
  });
});

describe("another person's connected apps", () => {
  test("an admin lists them", async () => {
    const h = await mcpHarness();
    const owner = await seed(h);
    await connect(h, owner);

    const { body } = await grantsRpc<ListedGrant[]>(
      h,
      "adminList",
      { userId: owner.id },
      await seed(h, "admin"),
    );

    expect(body).toMatchObject([
      { clientId: CLIENT_ID, name: "Example Agent" },
    ]);
  });

  test("an editor can't list them", async () => {
    const h = await mcpHarness();
    const owner = await seed(h);
    await connect(h, owner);

    const { status } = await grantsRpc(
      h,
      "adminList",
      { userId: owner.id },
      await seed(h),
    );

    expect(status).toBe(403);
  });

  test("an admin revokes one, which refuses its access token", async () => {
    const h = await mcpHarness();
    const owner = await seed(h);
    const token = await connect(h, owner);
    const admin = await seed(h, "admin");
    const { body } = await grantsRpc<ListedGrant[]>(
      h,
      "adminList",
      { userId: owner.id },
      admin,
    );

    await grantsRpc(
      h,
      "adminRevoke",
      { userId: owner.id, id: body[0]?.id },
      admin,
    );

    const call = await callTool(h, token, "content_list", { type: "post" });
    expect(call.status).toBe(401);
  });

  test("an editor can't revoke one", async () => {
    const h = await mcpHarness();
    const owner = await seed(h);
    const token = await connect(h, owner);
    const { body } = await grantsRpc<ListedGrant[]>(h, "list", {}, owner);

    const { status } = await grantsRpc(
      h,
      "adminRevoke",
      { userId: owner.id, id: body[0]?.id },
      await seed(h),
    );

    const call = await callTool(h, token, "content_list", { type: "post" });
    expect([status, call.status]).toEqual([403, 200]);
  });

  test("an admin's revoke answers with the revoked grant", async () => {
    const h = await mcpHarness();
    const owner = await seed(h);
    await connect(h, owner);
    const { body } = await grantsRpc<ListedGrant[]>(h, "list", {}, owner);
    const id = body[0]?.id;

    const revoked = await grantsRpc(
      h,
      "adminRevoke",
      { userId: owner.id, id },
      await seed(h, "admin"),
    );

    expect(revoked).toEqual({ status: 200, body: { id } });
  });

  test("an admin's revoke naming another owner is NOT_FOUND", async () => {
    const h = await mcpHarness();
    const owner = await seed(h);
    const token = await connect(h, owner);
    const { body } = await grantsRpc<ListedGrant[]>(h, "list", {}, owner);
    const bystander = await seed(h);

    const { status } = await grantsRpc(
      h,
      "adminRevoke",
      { userId: bystander.id, id: body[0]?.id },
      await seed(h, "admin"),
    );

    const call = await callTool(h, token, "content_list", { type: "post" });
    expect([status, call.status]).toEqual([404, 200]);
  });
});

import type { User } from "../../src/db/schema/users.js";
import type { TestPage } from "../../src/test/page.js";
import type { TestSite } from "../../src/test/site.js";
import { encodeBase64url } from "../../src/encoding.js";
import { definePlugin } from "../../src/plugin/define.js";

/** A blog whose posts an MCP client's token creates, lists and publishes. */
export const blog = definePlugin("test-blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      supports: ["title", "editor"],
    });
  },
});

export const CLIENT_ID = "https://agent.example/oauth/client.json";
export const REDIRECT_URI = "https://agent.example/callback";
export const MCP_URL = "https://cms.example/_plumix/mcp";

const CLIENT_DOCUMENT = {
  client_id: CLIENT_ID,
  client_name: "Example Agent",
  redirect_uris: [REDIRECT_URI],
};

type Site = Pick<TestSite, "visit" | "actingAs" | "fetch">;

/** Serves the client's metadata document at its `client_id`. */
export function serveClientDocument(site: Site): void {
  site.fetch.route("GET", CLIENT_ID, Response.json(CLIENT_DOCUMENT));
}

export interface Pkce {
  readonly verifier: string;
  readonly challenge: string;
}

export async function pkce(): Promise<Pkce> {
  const verifier = encodeBase64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return { verifier, challenge: encodeBase64url(new Uint8Array(digest)) };
}

type AuthorizationParams = Record<string, string>;

export function authorizationParams(
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
export function authorize(
  site: Site,
  params: AuthorizationParams,
  as: User | null = null,
): Promise<TestPage> {
  const path = `/_plumix/oauth/authorize?${new URLSearchParams(params).toString()}`;
  return as === null ? site.visit(path) : site.actingAs(as).visit(path);
}

export function locationOf(page: TestPage): URL {
  return new URL(page.headers.get("location") ?? "about:blank");
}

/** Consent approved as `user`: where the person's browser goes next. */
export async function approve(
  site: Site,
  user: User,
  params: AuthorizationParams,
  capabilities?: readonly string[],
): Promise<URL> {
  const { redirectTo } = await site
    .actingAs(user)
    .rpc.auth.oauthConsent.approve({
      ...params,
      ...(capabilities ? { capabilities: [...capabilities] } : {}),
    });
  return new URL(redirectTo);
}

interface TokenAnswer {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

/** Posts a form to the token endpoint, as a client does. */
export async function exchange(
  site: Site,
  form: Record<string, string>,
): Promise<TokenAnswer> {
  const page = await site.visit("/_plumix/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
  });
  return {
    status: page.status,
    body: JSON.parse(page.body) as Record<string, unknown>,
  };
}

export function exchangeForm(
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

interface TokenPair {
  readonly access_token: string;
  readonly refresh_token: string;
}

/** Consent approved as `user`, then the code exchanged: the token pair. */
export async function tokenPair(
  site: Site,
  user: User,
  {
    scope = "full",
    capabilities,
  }: { scope?: string; capabilities?: readonly string[] } = {},
): Promise<TokenPair> {
  const keys = await pkce();
  const params = authorizationParams(keys, { scope });
  const redirect = await approve(site, user, params, capabilities);
  const code = redirect.searchParams.get("code") ?? "";
  const { body } = await exchange(site, exchangeForm(code, keys));
  return body as unknown as TokenPair;
}

/** Consent approved as `user`, then the code exchanged: the access token. */
export async function connect(
  site: Site,
  user: User,
  options: { scope?: string; capabilities?: readonly string[] } = {},
): Promise<string> {
  return (await tokenPair(site, user, options)).access_token;
}

export function refresh(
  site: Site,
  refreshToken: string,
): Promise<TokenAnswer> {
  return exchange(site, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
  });
}

export interface ToolCallResult {
  readonly content: readonly { readonly type: string; readonly text: string }[];
  readonly isError?: boolean;
  readonly _meta?: { readonly code?: string };
}

export async function callTool(
  site: Site,
  token: string,
  name: string,
  args: Record<string, unknown>,
): Promise<{ status: number; result: ToolCallResult | undefined }> {
  const page = await site.visit(MCP_URL, {
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
  });
  if (page.status !== 200) return { status: page.status, result: undefined };
  const body = JSON.parse(page.body) as { result: ToolCallResult };
  return { status: page.status, result: body.result };
}

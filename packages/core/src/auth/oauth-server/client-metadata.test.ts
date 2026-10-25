import { afterEach, describe, expect, test, vi } from "vitest";

import type { OAuthClient } from "./client-metadata.js";
import {
  acceptsRedirectUri,
  ClientMetadataError,
  createClientMetadataResolver,
} from "./client-metadata.js";

const CLIENT_ID = "https://claude.ai/oauth/mcp-client.json";

function documentResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

/** A fetch that answers every request with `body` as JSON. */
function serving(body: unknown) {
  return vi.fn(() => Promise.resolve(documentResponse(body)));
}

/**
 * A fetch over `routes` that follows a redirect itself unless the caller asks
 * for `redirect: "manual"`, as the platform's does.
 */
function fakeWeb(routes: Record<string, () => Response>) {
  return vi.fn(
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = input instanceof Request ? input.url : input.toString();
      const response = routes[url]?.() ?? new Response(null, { status: 404 });
      const location = response.headers.get("location");
      if (location === null || init?.redirect === "manual") {
        return Promise.resolve(response);
      }
      return Promise.resolve(
        routes[location]?.() ?? new Response(null, { status: 404 }),
      );
    },
  );
}

describe("resolving an OAuth client from its metadata document", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("a valid document yields the client's name, host, logo and redirects", async () => {
    const fetch = serving({
      client_id: CLIENT_ID,
      client_name: "Claude",
      logo_uri: "https://claude.ai/logo.png",
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
      token_endpoint_auth_method: "none",
    });
    const resolver = createClientMetadataResolver({ fetch });

    const client = await resolver.resolve(CLIENT_ID);

    expect(client).toEqual({
      clientId: CLIENT_ID,
      name: "Claude",
      host: "claude.ai",
      logoUri: "https://claude.ai/logo.png",
      redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
      loopbackOnly: false,
    });
  });

  test.each([
    [["http://localhost/callback", "http://127.0.0.1:8080/callback"], true],
    [["http://localhost/callback", "https://claude.ai/callback"], false],
  ])(
    "a document redirecting to %j is loopback-only: %s",
    async (redirectUris, loopbackOnly) => {
      const fetch = serving({
        client_id: CLIENT_ID,
        redirect_uris: redirectUris,
      });
      const resolver = createClientMetadataResolver({ fetch });

      const client = await resolver.resolve(CLIENT_ID);

      expect(client.loopbackOnly).toBe(loopbackOnly);
    },
  );

  test("a second resolve within five minutes doesn't fetch again", async () => {
    vi.useFakeTimers();
    const fetch = serving({
      client_id: CLIENT_ID,
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    });
    const resolver = createClientMetadataResolver({ fetch });
    await resolver.resolve(CLIENT_ID);
    vi.advanceTimersByTime(5 * 60_000 - 1);

    await resolver.resolve(CLIENT_ID);

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("a resolve five minutes later fetches the document again", async () => {
    vi.useFakeTimers();
    const fetch = serving({
      client_id: CLIENT_ID,
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    });
    const resolver = createClientMetadataResolver({ fetch });
    await resolver.resolve(CLIENT_ID);
    vi.advanceTimersByTime(5 * 60_000);

    await resolver.resolve(CLIENT_ID);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("an http: document URL is refused without fetching it", async () => {
    const fetch = serving({});
    const resolver = createClientMetadataResolver({ fetch });

    const resolving = resolver.resolve(
      "http://claude.ai/oauth/mcp-client.json",
    );

    await expect(resolving).rejects.toEqual(
      new ClientMetadataError("insecure_url"),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  test("a document whose client_id isn't its URL is refused", async () => {
    const fetch = serving({
      client_id: "https://evil.example/oauth/mcp-client.json",
      client_name: "Claude",
      redirect_uris: ["https://evil.example/callback"],
    });
    const resolver = createClientMetadataResolver({ fetch });

    const resolving = resolver.resolve(CLIENT_ID);

    await expect(resolving).rejects.toEqual(
      new ClientMetadataError("client_id_mismatch"),
    );
  });

  test("a document over 5 KiB is refused", async () => {
    const fetch = serving({
      client_id: CLIENT_ID,
      client_name: "x".repeat(5 * 1024),
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    });
    const resolver = createClientMetadataResolver({ fetch });

    const resolving = resolver.resolve(CLIENT_ID);

    await expect(resolving).rejects.toEqual(
      new ClientMetadataError("too_large"),
    );
  });

  test("a document that takes over 5 seconds is refused", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const resolver = createClientMetadataResolver({ fetch });

    const resolving = resolver.resolve(CLIENT_ID);
    const refused = expect(resolving).rejects.toEqual(
      new ClientMetadataError("timeout"),
    );
    await vi.advanceTimersByTimeAsync(5_000);

    await refused;
  });

  test("a document whose host can't be reached is refused", async () => {
    const fetch = vi.fn(() => Promise.reject(new TypeError("fetch failed")));
    const resolver = createClientMetadataResolver({ fetch });

    const resolving = resolver.resolve(CLIENT_ID);

    await expect(resolving).rejects.toEqual(
      new ClientMetadataError("unreachable"),
    );
  });

  test("a redirect to an http: URL is refused", async () => {
    const fetch = fakeWeb({
      [CLIENT_ID]: () =>
        Response.redirect("http://claude.ai/oauth/mcp-client.json", 302),
      "http://claude.ai/oauth/mcp-client.json": () =>
        documentResponse({
          client_id: CLIENT_ID,
          client_name: "Claude",
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
        }),
    });
    const resolver = createClientMetadataResolver({ fetch });

    const resolving = resolver.resolve(CLIENT_ID);

    await expect(resolving).rejects.toEqual(
      new ClientMetadataError("insecure_redirect"),
    );
  });

  test("a redirect to another https: URL is followed", async () => {
    const fetch = fakeWeb({
      [CLIENT_ID]: () =>
        Response.redirect("https://cdn.claude.ai/mcp-client.json", 301),
      "https://cdn.claude.ai/mcp-client.json": () =>
        documentResponse({
          client_id: CLIENT_ID,
          client_name: "Claude",
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
        }),
    });
    const resolver = createClientMetadataResolver({ fetch });

    const client = await resolver.resolve(CLIENT_ID);

    expect(client.name).toBe("Claude");
  });

  test("a fourth redirect is refused", async () => {
    const fetch = fakeWeb({
      [CLIENT_ID]: () => Response.redirect("https://claude.ai/1", 302),
      "https://claude.ai/1": () =>
        Response.redirect("https://claude.ai/2", 302),
      "https://claude.ai/2": () =>
        Response.redirect("https://claude.ai/3", 302),
      "https://claude.ai/3": () =>
        Response.redirect("https://claude.ai/4", 302),
      "https://claude.ai/4": () =>
        documentResponse({
          client_id: CLIENT_ID,
          client_name: "Claude",
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
        }),
    });
    const resolver = createClientMetadataResolver({ fetch });

    const resolving = resolver.resolve(CLIENT_ID);

    await expect(resolving).rejects.toEqual(
      new ClientMetadataError("too_many_redirects"),
    );
  });

  test.each([
    [
      "a 404",
      () =>
        new Response(
          JSON.stringify({
            client_id: CLIENT_ID,
            redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          }),
          { status: 404 },
        ),
    ],
    ["a body that isn't JSON", () => new Response("<html></html>")],
    [
      "a document with no redirect URIs",
      () => documentResponse({ client_id: CLIENT_ID, redirect_uris: [] }),
    ],
  ])("%s is refused as an invalid document", async (_case, respond) => {
    const fetch = fakeWeb({ [CLIENT_ID]: respond });
    const resolver = createClientMetadataResolver({ fetch });

    const resolving = resolver.resolve(CLIENT_ID);

    await expect(resolving).rejects.toEqual(
      new ClientMetadataError("invalid_document"),
    );
  });
});

function clientRedirectingTo(...redirectUris: string[]): OAuthClient {
  return {
    clientId: CLIENT_ID,
    name: "Claude",
    host: "claude.ai",
    logoUri: undefined,
    redirectUris,
    loopbackOnly: false,
  };
}

describe("matching a redirect URI against an OAuth client", () => {
  test("a redirect URI the document lists is accepted", () => {
    const client = clientRedirectingTo(
      "https://claude.ai/api/mcp/auth_callback",
    );

    const accepted = acceptsRedirectUri(
      client,
      "https://claude.ai/api/mcp/auth_callback",
    );

    expect(accepted).toBe(true);
  });

  test.each([
    ["another path", "https://claude.ai/api/mcp/other"],
    ["another host", "https://evil.example/api/mcp/auth_callback"],
    ["another port", "https://claude.ai:8443/api/mcp/auth_callback"],
    ["an added query", "https://claude.ai/api/mcp/auth_callback?x=1"],
  ])("a redirect URI with %s is refused", (_change, redirectUri) => {
    const client = clientRedirectingTo(
      "https://claude.ai/api/mcp/auth_callback",
    );

    const accepted = acceptsRedirectUri(client, redirectUri);

    expect(accepted).toBe(false);
  });

  test.each([
    ["http://localhost/callback", "http://127.0.0.1:53682/callback"],
    ["http://localhost/callback", "http://localhost:9999/callback"],
    ["http://127.0.0.1:3000/callback", "http://localhost:4000/callback"],
  ])(
    "a document listing %s accepts the loopback redirect %s",
    (listed, redirectUri) => {
      const client = clientRedirectingTo(listed);

      const accepted = acceptsRedirectUri(client, redirectUri);

      expect(accepted).toBe(true);
    },
  );

  test.each([
    ["another path", "http://127.0.0.1:53682/other"],
    ["another scheme", "https://127.0.0.1:53682/callback"],
    ["an added query", "http://localhost:53682/callback?x=1"],
  ])("a loopback redirect with %s is refused", (_change, redirectUri) => {
    const client = clientRedirectingTo("http://localhost/callback");

    const accepted = acceptsRedirectUri(client, redirectUri);

    expect(accepted).toBe(false);
  });

  test("a non-loopback document doesn't accept a loopback redirect", () => {
    const client = clientRedirectingTo("https://claude.ai/callback");

    const accepted = acceptsRedirectUri(client, "http://localhost/callback");

    expect(accepted).toBe(false);
  });
});

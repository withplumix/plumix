import { describe, expect, test } from "vitest";

import type { FetchAnswer } from "../../test/fetch-fake.js";
import type { OAuthClient } from "./client-metadata.js";
import { requestStore } from "../../context/stores.js";
import { timeoutError } from "../../context/traced-fetch.js";
import { testSite } from "../../test/site.js";
import {
  acceptsRedirectUri,
  ClientMetadataError,
  createClientMetadataResolver,
} from "./client-metadata.js";

const CLIENT_ID = "https://claude.ai/oauth/mcp-client.json";

const site = await testSite({ plugins: [] });

/** A resolver fetching through the site's fake, so no request leaves the test. */
function resolver() {
  return createClientMetadataResolver({ fetch: site.fetch.send });
}

/** Answers a GET of `url` with `body` as JSON. */
function serve(url: string, body: unknown): void {
  site.fetch.route("GET", url, Response.json(body));
}

function answer(url: string, response: FetchAnswer): void {
  site.fetch.route("GET", url, response);
}

/** A valid document whose JSON is exactly `bytes` long. */
function documentOfSize(bytes: number) {
  const document = {
    client_id: CLIENT_ID,
    client_name: "",
    redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
  };
  const padding = bytes - JSON.stringify(document).length;
  return { ...document, client_name: "x".repeat(padding) };
}

describe("resolving an OAuth client from its metadata document", () => {
  test("a valid document yields the client's name, host, logo and redirects", async () => {
    serve(CLIENT_ID, {
      client_id: CLIENT_ID,
      client_name: "Claude",
      logo_uri: "https://claude.ai/logo.png",
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
      token_endpoint_auth_method: "none",
    });

    const client = await resolver().resolve(CLIENT_ID);

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
      serve(CLIENT_ID, { client_id: CLIENT_ID, redirect_uris: redirectUris });

      const client = await resolver().resolve(CLIENT_ID);

      expect(client.loopbackOnly).toBe(loopbackOnly);
    },
  );

  test("an http: document URL is refused without fetching it", async () => {
    const resolving = resolver().resolve(
      "http://claude.ai/oauth/mcp-client.json",
    );

    await expect(resolving).rejects.toEqual(
      new ClientMetadataError("insecure_url"),
    );
    site.fetch.assertNotFetched("*");
  });

  test("a document whose client_id isn't its URL is refused", async () => {
    serve(CLIENT_ID, {
      client_id: "https://evil.example/oauth/mcp-client.json",
      client_name: "Claude",
      redirect_uris: ["https://evil.example/callback"],
    });

    const resolving = resolver().resolve(CLIENT_ID);

    await expect(resolving).rejects.toEqual(
      new ClientMetadataError("client_id_mismatch"),
    );
  });

  test("a document over 5 KiB is refused", async () => {
    serve(CLIENT_ID, {
      client_id: CLIENT_ID,
      client_name: "x".repeat(5 * 1024),
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    });

    const resolving = resolver().resolve(CLIENT_ID);

    await expect(resolving).rejects.toEqual(
      new ClientMetadataError("too_large"),
    );
  });

  test("a document of exactly 5 KiB is accepted", async () => {
    serve(CLIENT_ID, documentOfSize(5 * 1024));

    const client = await resolver().resolve(CLIENT_ID);

    expect(client.clientId).toBe(CLIENT_ID);
  });

  test("a document one byte over 5 KiB is refused", async () => {
    serve(CLIENT_ID, documentOfSize(5 * 1024 + 1));

    const resolving = resolver().resolve(CLIENT_ID);

    await expect(resolving).rejects.toEqual(
      new ClientMetadataError("too_large"),
    );
  });

  test("a document without a name is named after its host", async () => {
    serve(CLIENT_ID, {
      client_id: CLIENT_ID,
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    });

    const client = await resolver().resolve(CLIENT_ID);

    expect(client.name).toBe("claude.ai");
  });

  test("a document whose host can't be reached is refused", async () => {
    answer(CLIENT_ID, "network error");

    const resolving = resolver().resolve(CLIENT_ID);

    await expect(resolving).rejects.toEqual(
      new ClientMetadataError("unreachable"),
    );
  });

  test("a redirect to an http: URL is refused", async () => {
    answer(
      CLIENT_ID,
      Response.redirect("http://claude.ai/oauth/mcp-client.json", 302),
    );
    serve("http://claude.ai/oauth/mcp-client.json", {
      client_id: CLIENT_ID,
      client_name: "Claude",
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    });

    const resolving = resolver().resolve(CLIENT_ID);

    await expect(resolving).rejects.toEqual(
      new ClientMetadataError("insecure_redirect"),
    );
  });

  test("a redirect to another https: URL is followed", async () => {
    answer(
      CLIENT_ID,
      Response.redirect("https://cdn.claude.ai/mcp-client.json", 301),
    );
    serve("https://cdn.claude.ai/mcp-client.json", {
      client_id: CLIENT_ID,
      client_name: "Claude",
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    });

    const client = await resolver().resolve(CLIENT_ID);

    expect(client.name).toBe("Claude");
  });

  test("a redirect to a relative path stays on https and is followed", async () => {
    answer(
      CLIENT_ID,
      new Response(null, {
        status: 302,
        headers: { location: "/moved/mcp-client.json" },
      }),
    );
    serve("https://claude.ai/moved/mcp-client.json", {
      client_id: CLIENT_ID,
      client_name: "Claude",
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    });

    const client = await resolver().resolve(CLIENT_ID);

    expect(client.name).toBe("Claude");
  });

  test("a fourth redirect is refused", async () => {
    answer(CLIENT_ID, Response.redirect("https://claude.ai/1", 302));
    answer(
      "https://claude.ai/1",
      Response.redirect("https://claude.ai/2", 302),
    );
    answer(
      "https://claude.ai/2",
      Response.redirect("https://claude.ai/3", 302),
    );
    answer(
      "https://claude.ai/3",
      Response.redirect("https://claude.ai/4", 302),
    );
    serve("https://claude.ai/4", {
      client_id: CLIENT_ID,
      client_name: "Claude",
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    });

    const resolving = resolver().resolve(CLIENT_ID);

    await expect(resolving).rejects.toEqual(
      new ClientMetadataError("too_many_redirects"),
    );
  });

  test.each([
    [
      "a 404",
      () =>
        Response.json(
          {
            client_id: CLIENT_ID,
            redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          },
          { status: 404 },
        ),
    ],
    ["a body that isn't JSON", () => new Response("<html></html>")],
    [
      "a document with no redirect URIs",
      () => Response.json({ client_id: CLIENT_ID, redirect_uris: [] }),
    ],
  ])("%s is refused as an invalid document", async (_case, respond) => {
    answer(CLIENT_ID, respond());

    const resolving = resolver().resolve(CLIENT_ID);

    await expect(resolving).rejects.toEqual(
      new ClientMetadataError("invalid_document"),
    );
  });

  test.each([
    "javascript:void(0)//",
    "data:text/html,callback",
    "http://claude.ai/callback",
    "claude.ai/callback",
  ])(
    "a document redirecting to %s is refused as an invalid document",
    async (uri) => {
      serve(CLIENT_ID, {
        client_id: CLIENT_ID,
        redirect_uris: ["https://claude.ai/api/mcp/auth_callback", uri],
      });

      const resolving = resolver().resolve(CLIENT_ID);

      await expect(resolving).rejects.toEqual(
        new ClientMetadataError("invalid_document"),
      );
    },
  );
});

/**
 * Resolves as a request on the site would, so `now()` reads the site's
 * clock, and keeps the `timeout` each fetch was bounded by.
 */
function resolverOnSite() {
  const timeouts: (number | false | undefined)[] = [];
  const resolver = createClientMetadataResolver({
    fetch: (input, init) => {
      timeouts.push(init?.timeout);
      return site.fetch.send(input, init);
    },
  });
  return {
    resolve: (clientId: string) =>
      requestStore.run(site.context, () => resolver.resolve(clientId)),
    timeouts,
  };
}

const DOCUMENT = {
  client_id: CLIENT_ID,
  redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
};

describe("a client's metadata document over time", () => {
  test("a second resolve within five minutes doesn't fetch again", async () => {
    serve(CLIENT_ID, DOCUMENT);
    const resolver = resolverOnSite();
    site.freezeTime("2026-11-07T10:00:00.000Z");
    await resolver.resolve(CLIENT_ID);
    site.freezeTime("2026-11-07T10:04:59.999Z");

    await resolver.resolve(CLIENT_ID);

    expect(resolver.timeouts).toHaveLength(1);
  });

  test("a resolve five minutes later fetches the document again", async () => {
    serve(CLIENT_ID, DOCUMENT);
    const resolver = resolverOnSite();
    site.freezeTime("2026-11-07T10:00:00.000Z");
    await resolver.resolve(CLIENT_ID);
    site.travel({ minutes: 5 });

    await resolver.resolve(CLIENT_ID);

    expect(resolver.timeouts).toHaveLength(2);
  });

  test("bounds the fetch at 5 seconds", async () => {
    serve(CLIENT_ID, DOCUMENT);
    const resolver = resolverOnSite();
    site.freezeTime("2026-11-07T10:00:00.000Z");

    await resolver.resolve(CLIENT_ID);

    expect(resolver.timeouts).toEqual([5_000]);
  });

  test("a redirect hop gets what is left of the one 5 second budget", async () => {
    answer(
      CLIENT_ID,
      Response.redirect("https://cdn.claude.ai/mcp-client.json", 301),
    );
    serve("https://cdn.claude.ai/mcp-client.json", DOCUMENT);
    const timeouts: (number | false | undefined)[] = [];
    const resolver = createClientMetadataResolver({
      fetch: (input, init) => {
        timeouts.push(init?.timeout);
        site.freezeTime("2026-11-07T10:00:02.000Z");
        return site.fetch.send(input, init);
      },
    });
    site.freezeTime("2026-11-07T10:00:00.000Z");

    await requestStore.run(site.context, () => resolver.resolve(CLIENT_ID));

    expect(timeouts).toEqual([5_000, 3_000]);
  });

  test("a document that takes over 5 seconds is refused", async () => {
    answer(CLIENT_ID, "timeout");

    const resolving = resolver().resolve(CLIENT_ID);

    await expect(resolving).rejects.toEqual(new ClientMetadataError("timeout"));
  });

  test("a fetch aborted with the request is unreachable, not a timeout", async () => {
    const resolving = createClientMetadataResolver({
      fetch: () => Promise.reject(new DOMException("aborted", "AbortError")),
    }).resolve(CLIENT_ID);

    await expect(resolving).rejects.toEqual(
      new ClientMetadataError("unreachable"),
    );
  });

  test("a body that stalls past 5 seconds is refused", async () => {
    // ctx.fetch's deadline errors the body it already answered.
    const stalled = new Response(
      new ReadableStream({
        pull(controller) {
          controller.error(timeoutError(5_000));
        },
      }),
    );
    const resolving = createClientMetadataResolver({
      fetch: () => Promise.resolve(stalled),
    }).resolve(CLIENT_ID);

    await expect(resolving).rejects.toEqual(new ClientMetadataError("timeout"));
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

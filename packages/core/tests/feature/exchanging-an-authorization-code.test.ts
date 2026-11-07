import { beforeEach, describe, expect, test } from "vitest";

import type { Pkce } from "../support/mcp-client.js";
import { testSite } from "../../src/test/site.js";
import {
  approve,
  authorizationParams,
  blog,
  exchange,
  exchangeForm,
  pkce,
  serveClientDocument,
} from "../support/mcp-client.js";

const site = await testSite({
  plugins: [blog],
  config: { mcp: { enabled: true } },
});

beforeEach(() => {
  serveClientDocument(site);
});

async function codeFor(keys: Pkce): Promise<string> {
  const user = await site.factory.editor.create();
  const redirect = await approve(site, user, authorizationParams(keys));
  return redirect.searchParams.get("code") ?? "";
}

describe("a refused code exchange", () => {
  test("a wrong PKCE verifier is invalid_grant", async () => {
    const keys = await pkce();
    const code = await codeFor(keys);

    const { status, body } = await exchange(
      site,
      exchangeForm(code, await pkce()),
    );

    expect(status).toBe(400);
    expect(body).toEqual({ error: "invalid_grant" });
  });

  test("a redirect URI other than the one the code was issued for is invalid_grant", async () => {
    const keys = await pkce();
    const code = await codeFor(keys);

    const { body } = await exchange(
      site,
      exchangeForm(code, keys, {
        redirect_uri: "https://agent.example/other",
      }),
    );

    expect(body).toEqual({ error: "invalid_grant" });
  });

  test("a resource other than the MCP URL is invalid_target", async () => {
    const keys = await pkce();
    const code = await codeFor(keys);

    const { body } = await exchange(
      site,
      exchangeForm(code, keys, { resource: "https://cms.example/_plumix/api" }),
    );

    expect(body).toEqual({ error: "invalid_target" });
  });

  test("a code used once is invalid_grant the second time", async () => {
    const keys = await pkce();
    const code = await codeFor(keys);
    await exchange(site, exchangeForm(code, keys));

    const { status, body } = await exchange(site, exchangeForm(code, keys));

    expect(status).toBe(400);
    expect(body).toEqual({ error: "invalid_grant" });
  });

  test("a code older than ten minutes is invalid_grant", async () => {
    site.freezeTime("2026-11-01T10:00:00Z");
    const keys = await pkce();
    const code = await codeFor(keys);

    site.freezeTime("2026-11-01T10:10:01Z");
    const { body } = await exchange(site, exchangeForm(code, keys));

    expect(body).toEqual({ error: "invalid_grant" });
  });

  test("a code still inside its ten minutes is exchanged", async () => {
    site.freezeTime("2026-11-01T10:00:00Z");
    const keys = await pkce();
    const code = await codeFor(keys);

    site.travel({ minutes: 9 });
    const { status } = await exchange(site, exchangeForm(code, keys));

    expect(status).toBe(200);
  });

  test("a JSON body is invalid_request", async () => {
    const page = await site.visit("/_plumix/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "authorization_code" }),
    });

    expect(page.status).toBe(400);
    expect(JSON.parse(page.body)).toEqual({ error: "invalid_request" });
  });
});

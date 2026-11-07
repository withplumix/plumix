import { describe, expect, test } from "vitest";

import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const tokenProbe = definePlugin("token-probe", {
  setup: (ctx) => {
    ctx.registerRoute({
      method: "GET",
      path: "/probe",
      auth: { capability: "entry:post:edit_any" },
      handler: () => new Response("ok", { status: 200 }),
    });
  },
});

const site = await testSite({ plugins: [tokenProbe] });

function listTokens(secret: string): ReturnType<typeof site.visit> {
  return site.visit("/_plumix/rpc/auth/apiTokens/list", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ json: {} }),
  });
}

// The editor's role grants the route's capability either way; the token's
// scopes decide.
describe("a plugin route behind a capability", () => {
  test("lets in a token scoped to that capability", async () => {
    const editor = await site.factory.editor.create();
    const { secret } = await site.factory.apiToken.create({
      userId: editor.id,
      scopes: ["entry:post:edit_any"],
    });

    const page = await site.visit("/_plumix/token-probe/probe", {
      headers: { authorization: `Bearer ${secret}` },
    });

    page.assertOk();
  });

  test("refuses a token whose scopes leave the capability out", async () => {
    const editor = await site.factory.editor.create();
    const { secret } = await site.factory.apiToken.create({
      userId: editor.id,
      scopes: ["entry:post:read"],
    });

    const page = await site.visit("/_plumix/token-probe/probe", {
      headers: { authorization: `Bearer ${secret}` },
    });

    page.assertForbidden();
  });
});

describe("an api token on rpc", () => {
  test("authenticates when it has no audience", async () => {
    const editor = await site.factory.editor.create();
    const { secret } = await site.factory.apiToken.create({
      userId: editor.id,
    });

    const page = await listTokens(secret);

    page.assertOk();
  });

  test("is refused with 401 when it is bound to the MCP audience", async () => {
    const editor = await site.factory.editor.create();
    const { secret } = await site.factory.apiToken.create({
      userId: editor.id,
      audience: "https://cms.example/_plumix/mcp",
    });

    const page = await listTokens(secret);

    expect(page.status).toBe(401);
  });
});

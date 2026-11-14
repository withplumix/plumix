import { createRouterClient } from "@orpc/server";
import * as v from "valibot";
import { describe, expect, test } from "vitest";

import type { McpTool } from "../../src/context/mcp-tool.js";
import type { TelemetrySpan } from "../../src/context/telemetry.js";
import type { TestSite } from "../../src/test/site.js";
import { apiTokens } from "../../src/db/schema/api_tokens.js";
import { entries } from "../../src/db/schema/entries.js";
import { mcpRouterClient } from "../../src/mcp/router-client.js";
import { definePlugin } from "../../src/plugin/define.js";
import { appRouter } from "../../src/rpc/router.js";
import { testSite } from "../../src/test/site.js";
import { blog, callTool } from "../support/mcp-client.js";

const mintToken: McpTool<ReturnType<typeof v.object>> = {
  name: "mint_token",
  description: "Test-only: mints an API token through RPC.",
  inputSchema: v.object({}),
  run: async (ctx) =>
    mcpRouterClient(ctx).auth.apiTokens.create({ name: "wider", scopes: null }),
};

const minter = definePlugin("test-minter", {
  setup: (ctx) => {
    ctx.registerMcpTool(mintToken);
  },
});

const site = await testSite({
  plugins: [blog, minter],
  config: { mcp: { enabled: true } },
});

/** Every span the site's last request recorded. */
function lastRequestSpans(on: TestSite): TelemetrySpan[] {
  const walk = (span: TelemetrySpan): TelemetrySpan[] => [
    span,
    ...span.children.flatMap(walk),
  ];
  return on.telemetry.snapshots.at(-1)?.spans.flatMap(walk) ?? [];
}

describe("an MCP tool call", () => {
  test("validates its token once, however many procedures the tool runs", async () => {
    const editor = await site.factory.editor.create();
    const { secret } = await site.factory.apiToken.create({
      userId: editor.id,
      name: "agent",
    });
    const draft = await site.factory.draft.create({ authorId: editor.id });
    const { etag } = await site
      .actingAs(editor)
      .rpc.entry.get({ id: draft.id });

    const call = await callTool(site, secret, "content_update", {
      type: "post",
      id: draft.id,
      ifMatch: etag,
      title: "Edited",
    });

    expect(call.result?.isError).toBeUndefined();
    const spans = lastRequestSpans(site);
    expect(spans.filter((span) => span.name === "auth")).toHaveLength(1);
    expect(
      spans.filter((span) => {
        const sql = span.attributes["db.sql"];
        return (
          typeof sql === "string" &&
          sql.startsWith('update "api_tokens" set "last_used_at"')
        );
      }),
    ).toHaveLength(1);
  });
});

describe("a test site's context acting as a user", () => {
  test("runs a procedure reached through its own router client as that user", async () => {
    const editor = await site.factory.editor.create();
    const client = createRouterClient(appRouter, {
      context: site.actingAs(editor).context,
    });

    const created = await client.entry.create({
      type: "post",
      slug: "mine",
      title: "Mine",
    });

    const [row] = await site.context.db.select().from(entries);
    expect(row).toMatchObject({ id: created.id, authorId: editor.id });
  });
});

describe("a procedure that creates a credential", () => {
  test("refuses an MCP tool calling it with the request's API token", async () => {
    const editor = await site.factory.editor.create();
    const { secret } = await site.factory.apiToken.create({
      userId: editor.id,
      name: "agent",
    });

    const call = await callTool(site, secret, "mint_token", {});

    expect(call.result?.isError).toBe(true);
    expect(await site.context.db.select().from(apiTokens)).toHaveLength(1);
  });

  test("admits a test site's context acting as a signed-in user", async () => {
    const editor = await site.factory.editor.create();
    const client = createRouterClient(appRouter, {
      context: site.actingAs(editor).context,
    });

    const created = await client.auth.apiTokens.create({ name: "mine" });

    expect(created.token.name).toBe("mine");
  });
});

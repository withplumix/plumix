import * as v from "valibot";
import { describe, expect, test } from "vitest";

import type { User } from "../../src/db/schema/users.js";
import { useUser } from "../../src/blocks/renderer/index.js";
import { definePlugin } from "../../src/plugin/define.js";
import { entry, fallback } from "../../src/route/render/template-builders.js";
import { authenticated } from "../../src/rpc/authenticated.js";
import { base } from "../../src/rpc/base.js";
import { API_PREFIX, MCP_PATH } from "../../src/runtime/dispatcher.js";
import { testSite } from "../../src/test/site.js";
import { defineTheme } from "../../src/theme.js";

/** Every surface a plugin reaches answers with the `ctx.user` it was handed. */
const probe = definePlugin("probe", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.registerRpcRouter({
      whoami: base.use(authenticated).handler(({ context }) => context.user),
    });
    ctx.registerRoute({
      method: "GET",
      path: "/whoami",
      auth: "authenticated",
      handler: (_request, routeCtx) => Response.json(routeCtx.user),
    });
    ctx.registerPublicRoute({
      path: "/whoami",
      handler: (_request, routeCtx) => Response.json(routeCtx.user),
    });
    ctx.registerRestResource({
      path: "/probe/site/whoami",
      auth: "authenticated",
      output: v.unknown(),
      handler: ({ context }) => context.user,
    });
    ctx.registerMcpTool({
      name: "whoami",
      description: "Test-only: the tool's principal.",
      inputSchema: v.object({}),
      run: (toolCtx) => toolCtx.user,
    });
  },
});

function Viewer() {
  return (
    <script
      type="application/json"
      data-testid="viewer"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(useUser()) }}
    />
  );
}

const site = await testSite({
  plugins: [probe],
  config: {
    api: { enabled: true },
    mcp: { enabled: true },
    theme: defineTheme({
      templates: [entry(() => <Viewer />), fallback(() => null)],
    }),
  },
});

const asJson = (body: string): unknown => JSON.parse(body);

const SURFACES: readonly {
  readonly name: string;
  readonly read: (user: User) => Promise<unknown>;
}[] = [
  {
    name: "an RPC procedure",
    read: async (user) => {
      const page = await site
        .actingAs(user)
        .visit("/_plumix/rpc/probe/whoami", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-plumix-request": "1",
          },
          body: JSON.stringify({ json: {} }),
        });
      return (asJson(page.body) as { json: unknown }).json;
    },
  },
  {
    name: "a plugin raw route",
    read: async (user) =>
      asJson((await site.actingAs(user).visit("/_plumix/probe/whoami")).body),
  },
  {
    name: "a plugin public route",
    read: async (user) =>
      asJson((await site.actingAs(user).visit("/whoami")).body),
  },
  {
    name: "a public render",
    read: async (user) => {
      await site.factory.published.create({ slug: `by-${user.id}` });
      const page = await site.actingAs(user).visit(`/post/by-${user.id}`);
      const embedded = /data-testid="viewer">(.*?)<\/script>/s.exec(page.body);
      return asJson(embedded?.[1] ?? "undefined");
    },
  },
  {
    name: "a REST resource",
    read: async (user) => {
      const { secret } = await site.factory.apiToken.create({
        userId: user.id,
      });
      const page = await site.visit(`${API_PREFIX}/v1/probe/site/whoami`, {
        headers: { authorization: `Bearer ${secret}` },
      });
      return asJson(page.body);
    },
  },
  {
    name: "an MCP tool",
    read: async (user) => {
      const { secret } = await site.factory.apiToken.create({
        userId: user.id,
      });
      const page = await site.visit(MCP_PATH, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "whoami", arguments: {} },
        }),
      });
      const { result } = asJson(page.body) as {
        result: { content: readonly { text: string }[] };
      };
      return asJson(result.content[0]?.text ?? "undefined");
    },
  },
];

describe.each(SURFACES)("$name", ({ read }) => {
  test("sees the signed-in user's id, email, name, avatar, role and meta, and nothing else", async () => {
    const user = await site.factory.editor.create({
      name: "Ann Editor",
      avatarUrl: "https://cdn.example/ann.png",
      meta: { team: "news" },
    });

    expect(await read(user)).toStrictEqual({
      id: user.id,
      email: user.email,
      name: "Ann Editor",
      avatarUrl: "https://cdn.example/ann.png",
      role: "editor",
      meta: { team: "news" },
    });
  });

  test("sees a null name and avatar for a user who never set them", async () => {
    const user = await site.factory.editor.create();

    expect(await read(user)).toStrictEqual({
      id: user.id,
      email: user.email,
      name: null,
      avatarUrl: null,
      role: "editor",
      meta: {},
    });
  });
});

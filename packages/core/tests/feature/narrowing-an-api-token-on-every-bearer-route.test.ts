import * as v from "valibot";
import { describe, expect, test } from "vitest";

import type { TestPage } from "../../src/test/page.js";
import type { FetchOptions } from "../../src/test/request.js";
import { definePlugin } from "../../src/plugin/define.js";
import { CORE_REST_ROUTES } from "../../src/rest/rest-routes.js";
import { API_PREFIX, MCP_PATH } from "../../src/runtime/dispatcher.js";
import { testSite } from "../../src/test/site.js";
import { blog } from "../support/mcp-client.js";
import { SYNC_ROUTES } from "../support/sync-routes.js";

/** One plugin route and one REST resource, so the plugin registries are read too. */
const probe = definePlugin("probe", {
  setup: (ctx) => {
    ctx.registerRoute({
      method: "GET",
      path: "/settings",
      auth: { capability: "settings:manage" },
      handler: () => Response.json({ ok: true }),
    });
    ctx.registerRestResource({
      path: "/probe/site/settings",
      auth: { capability: "settings:manage" },
      output: v.object({ ok: v.boolean() }),
      handler: () => ({ ok: true }),
    });
  },
});

const site = await testSite({
  plugins: [blog, probe],
  config: {
    api: { enabled: true },
    mcp: { enabled: true },
    roles: {
      nobody: { can: {} },
      settingsOnly: { can: { settings: ["manage"] } },
    },
  },
});

type Method = NonNullable<FetchOptions["method"]>;

const METHODS: readonly Method[] = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
];

/** A route registered for any method (`*`) is called with none, so it fails loudly. */
function methodOf(registered: string): Method {
  const method = METHODS.find((known) => known === registered);
  if (method === undefined) throw new Error(`no request for ${registered}`);
  return method;
}

interface BearerRoute {
  readonly method: Method;
  readonly path: string;
}

const REST_PREFIX = `${API_PREFIX}/v1`;

/** A body each route accepts, so a refusal comes from the token, not the input. */
const BODIES: Readonly<Record<string, string>> = {
  [`${REST_PREFIX}/system/mail/test`]: JSON.stringify({
    to: "ann@example.com",
  }),
  [MCP_PATH]: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
};

/** Every route the dispatcher answers a bearer token on, read from what is registered. */
const BEARER_ROUTES: readonly BearerRoute[] = [
  ...SYNC_ROUTES,
  ...[...CORE_REST_ROUTES, ...site.context.plugins.restResources].map(
    (route) => ({
      method: methodOf(route.method),
      path: `${REST_PREFIX}${route.path
        .replace("{collection}", "posts")
        .replace("{id}", "1")}`,
    }),
  ),
  ...site.context.plugins.rawRoutes.map((route) => ({
    method: methodOf(route.method),
    path: `/_plumix/${route.pluginId}${route.path}`,
  })),
  { method: "POST", path: MCP_PATH },
];

/** Each narrowing, beside the role that holds exactly what it keeps. */
const NARROWINGS = [
  { scopes: [], role: "nobody" },
  { scopes: ["settings:manage"], role: "settingsOnly" },
] as const;

function call(route: BearerRoute, secret: string): Promise<TestPage> {
  return site.visit(route.path, {
    method: route.method,
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "x-plumix-request": "1",
    },
    ...(route.method === "POST" && { body: BODIES[route.path] ?? "{}" }),
  });
}

async function mintToken(
  role: string,
  scopes: readonly string[] | null,
): Promise<string> {
  const user = await site.factory.user.create({ role });
  const { secret } = await site.factory.apiToken.create({
    userId: user.id,
    scopes,
  });
  return secret;
}

/** A refusal reads the same whichever check made it. */
function answerOf(page: TestPage): unknown {
  return [401, 403].includes(page.status)
    ? "refused"
    : { status: page.status, body: page.body };
}

describe.each(BEARER_ROUTES)("$method $path", (route) => {
  test.each(NARROWINGS)(
    "answers an admin token narrowed to $scopes with no more than the $role role gets",
    async ({ scopes, role }) => {
      const author = await site.factory.author.create();
      await site.factory.draft.create({ id: 1, authorId: author.id });
      await site.factory.published.create({ authorId: author.id });
      const roleAnswer = answerOf(
        await call(route, await mintToken(role, null)),
      );
      const narrowed = await mintToken("admin", scopes);

      const page = await call(route, narrowed);

      expect(["refused", roleAnswer]).toContainEqual(answerOf(page));
    },
  );
});

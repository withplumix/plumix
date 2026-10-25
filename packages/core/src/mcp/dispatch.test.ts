import {
  CLIENT_CAPABILITIES_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";
import * as v from "valibot";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { AllowCustomStyles } from "../blocks/styles/style-policy.js";
import type { ThemeTokens } from "../blocks/styles/types.js";
import type { McpTool } from "../context/mcp-tool.js";
import type { TelemetrySnapshot, TelemetrySpan } from "../context/telemetry.js";
import type { UserRole } from "../db/schema/users.js";
import type { DispatcherHarness } from "../test/dispatcher.js";
import corePackage from "../../package.json" with { type: "json" };
import { defineBlock } from "../blocks/block-registry.js";
import { DEV_ERROR_CLIENT_ERRORS_ENDPOINT } from "../dev/ui/index.js";
import { definePlugin } from "../plugin/define.js";
import { fallback } from "../route/render/template-builders.js";
import { trustRequest } from "../runtime/request-trust.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { defineTheme } from "../theme.js";

/**
 * MCP is default-off; every test in this suite exercises the live endpoint,
 * so opt it in here rather than repeating `mcp: { enabled: true }` per call.
 */
function mcpHarness(
  options: Parameters<typeof createDispatcherHarness>[0] = {},
): Promise<DispatcherHarness> {
  return createDispatcherHarness({
    ...options,
    config: { mcp: { enabled: true }, ...options.config },
  });
}

const blog = definePlugin("test-blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      isHierarchical: false,
      supports: ["title", "editor", "excerpt"],
      termTaxonomies: ["category"],
    });
    ctx.registerTermTaxonomy("category", {
      label: "Categories",
      isHierarchical: true,
      entryTypes: ["post"],
    });
  },
});

const card = defineBlock({
  name: "site/card",
  title: "Card",
  render: () => null,
  inputs: [
    { name: "heading", type: "text" },
    {
      name: "tone",
      type: "select",
      options: [
        { label: "Plain", value: "plain" },
        { label: "Loud", value: "loud" },
      ],
    },
    { name: "body", type: "slot", allowedBlocks: ["core/rich-text"] },
  ],
  defaultStyles: { large: { padding: "var(--plumix-spacing-md, 16px)" } },
});

const hero = defineBlock({
  name: "site/hero",
  render: () => null,
  inputs: [
    {
      name: "align",
      type: "select",
      styleProperty: "textAlign",
      content: true,
    },
    { name: "photo", type: "media", accept: ["image/*"] },
    {
      name: "items",
      type: "slot",
      rawSlot: true,
      defaultChildren: [{ id: "d1", name: "core/rich-text", attrs: {} }],
    },
  ],
});

function themedMcpHarness(
  theme: {
    allowedBlocks?: readonly string[];
    tokens?: ThemeTokens;
    allowCustomStyles?: AllowCustomStyles;
  } = {},
): Promise<DispatcherHarness> {
  return mcpHarness({
    config: {
      plugins: [blog],
      theme: defineTheme({
        templates: [fallback(() => null)],
        blocks: [card, hero],
        ...theme,
      }),
    },
  });
}

/**
 * Not itself a telemetry consumer, so it can't vote into existence the
 * collection it measures.
 */
const spanProbe = definePlugin("test-span-probe", {
  setup: (ctx) => {
    ctx.registerMcpTool({
      name: "probe_spans",
      description: "Test-only: how many spans the live collector holds.",
      inputSchema: v.object({}),
      run: (toolCtx) => ({ spans: toolCtx.telemetry.getSpans().length }),
    });
  },
});

interface JsonRpcEnvelope<TResult> {
  readonly jsonrpc: "2.0";
  readonly id: number;
  readonly result: TResult;
}

interface ToolDescriptor {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: { readonly type: string };
  readonly annotations: Readonly<Record<string, boolean>>;
}

interface ToolCallResult {
  readonly content: readonly { readonly type: string; readonly text: string }[];
  readonly isError?: boolean;
}

interface ContentModel {
  readonly entryTypes: readonly Record<string, unknown>[];
  readonly taxonomies: readonly Record<string, unknown>[];
}

interface BuildingModel {
  readonly blocks: readonly {
    readonly name: string;
    readonly inputs: readonly Record<string, unknown>[];
    readonly defaultStyles?: unknown;
  }[];
  readonly styles: {
    readonly allowCustomStyles: AllowCustomStyles;
    readonly tokens: Record<string, Record<string, unknown>>;
  };
}

async function mintPat(
  h: DispatcherHarness,
  {
    role = "editor",
    scopes = null,
  }: { role?: UserRole; scopes?: string[] | null } = {},
): Promise<string> {
  const user = await h.factory.user.create({ role });
  const { secret } = await h.factory.apiToken.create({
    userId: user.id,
    scopes,
  });
  return secret;
}

function mcpRequest(
  body: unknown,
  init: {
    secret?: string;
    method?: string;
    url?: string;
    origin?: string;
    headers?: Record<string, string>;
  } = {},
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    ...init.headers,
  };
  if (init.secret) headers.authorization = `Bearer ${init.secret}`;
  if (init.origin) headers.origin = init.origin;
  const method = init.method ?? "POST";
  return new Request(init.url ?? "https://cms.example/_plumix/mcp", {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

async function callMcp<TResult>(
  h: DispatcherHarness,
  secret: string,
  body: unknown,
): Promise<{ res: Response; json: JsonRpcEnvelope<TResult> }> {
  const res = await h.dispatch(mcpRequest(body, { secret }));
  const json = (await res.json()) as JsonRpcEnvelope<TResult>;
  return { res, json };
}

function callTool(
  h: DispatcherHarness,
  secret: string,
  id: number,
  name: string,
  args: Record<string, unknown>,
): Promise<{ res: Response; json: JsonRpcEnvelope<ToolCallResult> }> {
  return callMcp<ToolCallResult>(h, secret, {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: args },
  });
}

function parseToolResult<T>(json: JsonRpcEnvelope<ToolCallResult>): T {
  return JSON.parse(json.result.content[0]?.text ?? "null") as T;
}

describe("MCP endpoint — tools/list", () => {
  test("a PAT-authenticated client sees schema_describe with JSON Schema + readOnlyHint", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const secret = await mintPat(h);

    const { res, json } = await callMcp<{ tools: ToolDescriptor[] }>(
      h,
      secret,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      },
    );

    expect(res.status).toBe(200);
    const tool = json.result.tools.find((t) => t.name === "schema_describe");
    expect(tool).toBeDefined();
    expect(tool?.annotations.readOnlyHint).toBe(true);
    expect(tool?.inputSchema.type).toBe("object");
  });
});

describe("MCP endpoint — the server", () => {
  const countInput = v.object({ limit: v.number() });
  const countThings: McpTool<typeof countInput> = {
    name: "count_things",
    description: "Test-only: declares nothing.",
    inputSchema: countInput,
    run: (_ctx, { limit }) => ({ count: limit }),
  };
  const annotated = definePlugin("test-annotated", {
    setup: (ctx) => {
      ctx.registerMcpTool({
        name: "trash_thing",
        description: "Test-only: declares a destructive write.",
        inputSchema: v.object({}),
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
        },
        run: () => ({ trashed: true }),
      });
      ctx.registerMcpTool({
        name: "explode",
        description: "Test-only: throws an error that is not an McpToolError.",
        inputSchema: v.object({}),
        run: () => {
          throw new Error("kaboom");
        },
      });
      ctx.registerMcpTool(countThings);
    },
  });

  async function listTools(h: DispatcherHarness): Promise<ToolDescriptor[]> {
    const secret = await mintPat(h);
    const { json } = await callMcp<{ tools: ToolDescriptor[] }>(h, secret, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    return json.result.tools;
  }

  test("initialize reports core's package version", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);

    const { json } = await callMcp<{
      serverInfo: { name: string; version: string };
    }>(h, secret, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      },
    });

    expect(json.result.serverInfo).toEqual({
      name: "plumix",
      version: corePackage.version,
    });
  });

  test("a tool registered with annotations is listed with exactly those hints", async () => {
    const h = await mcpHarness({ config: { plugins: [annotated] } });

    const tools = await listTools(h);

    expect(tools.find((t) => t.name === "trash_thing")?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    });
  });

  test("a tool registered without annotations is listed as read-only", async () => {
    const h = await mcpHarness({ config: { plugins: [annotated] } });

    const tools = await listTools(h);

    expect(tools.find((t) => t.name === "count_things")?.annotations).toEqual({
      readOnlyHint: true,
    });
  });

  test("a bad input comes back as a bad_input tool error, not a JSON-RPC error", async () => {
    const h = await mcpHarness({ config: { plugins: [annotated] } });
    const secret = await mintPat(h);

    const { json } = await callTool(h, secret, 1, "count_things", {
      limit: "ten",
    });

    expect(json.result.isError).toBe(true);
    expect(json.result.content[0]?.text).toContain("bad_input");
    expect(json.result.content[0]?.text).toContain("limit");
  });

  test("an error that is not an McpToolError comes back as an isError result carrying only its message", async () => {
    const h = await mcpHarness({ config: { plugins: [annotated] } });
    const secret = await mintPat(h);

    const { json } = await callTool(h, secret, 1, "explode", {});

    expect(json.result.isError).toBe(true);
    expect(json.result.content).toEqual([{ type: "text", text: "kaboom" }]);
  });

  test("an unknown tool is a JSON-RPC error", async () => {
    const h = await mcpHarness({ config: { plugins: [annotated] } });
    const secret = await mintPat(h);

    const res = await h.dispatch(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "no_such_tool", arguments: {} },
        },
        { secret },
      ),
    );

    const json = (await res.json()) as {
      result?: unknown;
      error?: { message: string };
    };
    expect(json.result).toBeUndefined();
    expect(json.error?.message).toContain("no_such_tool");
  });

  test("a request on the 2026-07-28 spec is answered in JSON", async () => {
    const h = await mcpHarness({ config: { plugins: [annotated] } });
    const secret = await mintPat(h);

    const res = await h.dispatch(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "count_things",
            arguments: { limit: 3 },
            _meta: {
              [PROTOCOL_VERSION_META_KEY]: "2026-07-28",
              [CLIENT_CAPABILITIES_META_KEY]: {},
            },
          },
        },
        {
          secret,
          headers: {
            "mcp-protocol-version": "2026-07-28",
            "mcp-method": "tools/call",
            "mcp-name": "count_things",
          },
        },
      ),
    );

    expect(res.headers.get("content-type")).toContain("application/json");
    const json = (await res.json()) as JsonRpcEnvelope<ToolCallResult>;
    expect(parseToolResult(json)).toEqual({ count: 3 });
  });
});

describe("MCP endpoint — no database wipe", () => {
  afterEach(() => void vi.unstubAllEnvs());

  // `plumix migrate fresh` drops every table, so only a person at the CLI
  // runs it: no tool reaches it, dev's included.
  test("no tool drops tables or migrates", async () => {
    vi.stubEnv("PLUMIX_DEV", "1");
    const h = await mcpHarness({ config: { plugins: [blog] } });

    const res = await h.dispatch(
      mcpRequest(
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { url: "http://localhost/_plumix/mcp" },
      ),
    );

    const json = (await res.json()) as JsonRpcEnvelope<{
      tools: ToolDescriptor[];
    }>;
    expect(json.result.tools.length).toBeGreaterThan(0);
    expect(
      json.result.tools.filter((t) => /fresh|wipe|migrat|drop/i.test(t.name)),
    ).toEqual([]);
  });
});

describe("MCP endpoint — a plugin write tool", () => {
  const text = (id: string) => ({
    id,
    name: "core/rich-text",
    attrs: { body: "<p>Hi</p>" },
  });
  const inputSchema = v.object({ id: v.number(), ifMatch: v.string() });
  // A site's own write tool, saving through the procedures' `ctx.entries`.
  const appendText: McpTool<typeof inputSchema> = {
    name: "append_text",
    description: "Test-only: appends a text block to an entry.",
    inputSchema,
    run: async (toolCtx, { id, ifMatch }) => {
      await toolCtx.entries.update({
        id,
        ifMatch: new Date(ifMatch),
        content: {
          version: "plumix.v2",
          blocks: [text("p1"), text("p2")],
        },
      });
      return { saved: true };
    },
  };
  const writer = definePlugin("test-writer", {
    setup: (ctx) => {
      ctx.registerMcpTool(appendText);
    },
  });

  test("refuses a layout change from a writer without edit_layout", async () => {
    const h = await mcpHarness({ config: { plugins: [blog, writer] } });
    const user = await h.factory.user.create({ role: "contributor" });
    const { secret } = await h.factory.apiToken.create({
      userId: user.id,
      scopes: null,
    });
    const entry = await h.factory.entry.create({
      type: "post",
      status: "draft",
      authorId: user.id,
      content: { version: "plumix.v2", blocks: [text("p1")] },
    });

    const { json } = await callTool(h, secret, 1, "append_text", {
      id: entry.id,
      ifMatch: entry.updatedAt.toISOString(),
    });

    expect(json.result.isError).toBe(true);
    expect(json.result.content[0]?.text).toContain(
      "Block content failed registry validation",
    );
    const row = await h.db.query.entries.findFirst({
      where: (entries, { eq }) => eq(entries.id, entry.id),
    });
    expect(row?.content).toEqual({
      version: "plumix.v2",
      blocks: [text("p1")],
    });
  });
});

describe("MCP endpoint — schema_describe", () => {
  test("with no argument it lists entry types and taxonomies", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const secret = await mintPat(h);

    const { res, json } = await callTool(h, secret, 2, "schema_describe", {});

    expect(res.status).toBe(200);
    const model = parseToolResult<ContentModel>(json);
    expect(model.entryTypes).toEqual([
      {
        name: "post",
        label: "Posts",
        isHierarchical: false,
        supports: ["title", "editor", "excerpt"],
        taxonomies: ["category"],
      },
    ]);
    expect(model.taxonomies).toEqual([
      { name: "category", label: "Categories", isHierarchical: true },
    ]);
  });

  test("with a type it returns that type's statuses, supports, and taxonomies", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const secret = await mintPat(h);

    const { res, json } = await callTool(h, secret, 3, "schema_describe", {
      type: "post",
    });

    expect(res.status).toBe(200);
    expect(parseToolResult(json)).toEqual({
      name: "post",
      label: "Posts",
      isHierarchical: false,
      statuses: ["draft", "published", "scheduled", "trash"],
      supports: ["title", "editor", "excerpt"],
      taxonomies: ["category"],
    });
  });

  test("an unknown type comes back as an MCP error envelope, not a crash", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const secret = await mintPat(h);

    const { res, json } = await callTool(h, secret, 4, "schema_describe", {
      type: "nope",
    });

    expect(res.status).toBe(200);
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0]?.text).toContain("not_found");
    expect(json.result.content[0]?.text).toContain("nope");
  });

  test("with no argument it lists only the blocks the theme allows, in registration order", async () => {
    const h = await themedMcpHarness({
      allowedBlocks: ["core/group", "core/rich-text"],
    });
    const secret = await mintPat(h);

    const { json } = await callTool(h, secret, 5, "schema_describe", {});

    const { blocks } = parseToolResult<BuildingModel>(json);
    expect(blocks.map((block) => block.name)).toEqual([
      "core/rich-text",
      "core/group",
      "site/card",
      "site/hero",
    ]);
  });

  test("a block lists its inputs, with each slot's allowed children", async () => {
    const h = await themedMcpHarness({
      allowedBlocks: ["core/group", "core/rich-text"],
    });
    const secret = await mintPat(h);

    const { json } = await callTool(h, secret, 6, "schema_describe", {});

    const { blocks } = parseToolResult<BuildingModel>(json);
    expect(blocks.find((b) => b.name === "site/card")?.inputs).toEqual([
      { name: "heading", type: "text" },
      { name: "tone", type: "select", options: ["plain", "loud"] },
      { name: "body", type: "slot", allowedBlocks: ["core/rich-text"] },
    ]);
  });

  test("a slot that lists no blocks offers every allowed block not bound to another parent", async () => {
    const h = await themedMcpHarness({
      allowedBlocks: ["core/group", "core/columns"],
    });
    const secret = await mintPat(h);

    const { json } = await callTool(h, secret, 7, "schema_describe", {});

    const { blocks } = parseToolResult<BuildingModel>(json);
    expect(blocks.find((b) => b.name === "core/group")?.inputs).toEqual([
      {
        name: "content",
        type: "slot",
        label: "Content",
        allowedBlocks: ["core/group", "core/columns", "site/card", "site/hero"],
      },
    ]);
  });

  test("with no argument it returns the style policy and the tokens by category", async () => {
    const h = await themedMcpHarness({
      allowCustomStyles: ["width"],
      tokens: { color: { primary: { label: "Primary", value: "#06f" } } },
    });
    const secret = await mintPat(h);

    const { json } = await callTool(h, secret, 8, "schema_describe", {});

    const { styles } = parseToolResult<BuildingModel>(json);
    expect(styles.allowCustomStyles).toEqual(["width"]);
    expect(styles.tokens).toEqual({
      color: {
        primary: {
          label: "Primary",
          value: "#06f",
          use: "var(--plumix-color-primary)",
        },
      },
    });
  });

  test("an input keeps the fields an agent needs to write it", async () => {
    const h = await themedMcpHarness();
    const secret = await mintPat(h);

    const { json } = await callTool(h, secret, 11, "schema_describe", {});

    const { blocks } = parseToolResult<BuildingModel>(json);
    expect(blocks.find((b) => b.name === "site/hero")?.inputs).toMatchObject([
      { name: "align", styleProperty: "textAlign", content: true },
      { name: "photo", accept: ["image/*"] },
      {
        name: "items",
        rawSlot: true,
        defaultChildren: [{ id: "d1", name: "core/rich-text", attrs: {} }],
      },
    ]);
  });

  test("a block lists its default styles", async () => {
    const h = await themedMcpHarness();
    const secret = await mintPat(h);

    const { json } = await callTool(h, secret, 9, "schema_describe", {});

    const { blocks } = parseToolResult<BuildingModel>(json);
    expect(blocks.find((b) => b.name === "site/card")?.defaultStyles).toEqual({
      large: { padding: "var(--plumix-spacing-md, 16px)" },
    });
  });

  test("a token with only drafting capabilities reads the allowed blocks", async () => {
    const h = await themedMcpHarness();
    const secret = await mintPat(h, {
      scopes: ["entry:post:create", "entry:post:edit_own"],
    });

    const { json } = await callTool(h, secret, 10, "schema_describe", {});

    const { blocks } = parseToolResult<BuildingModel>(json);
    expect(blocks.map((b) => b.name)).toContain("site/card");
  });
});

describe("MCP endpoint — transport guards", () => {
  test.each(["GET", "DELETE"])(
    "%s is rejected with 405 (the endpoint is POST-only)",
    async (method) => {
      const h = await mcpHarness({ config: { plugins: [blog] } });
      const secret = await mintPat(h);

      const res = await h.dispatch(mcpRequest({}, { secret, method }));

      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
    },
  );

  test("a request without a bearer token is rejected with 401", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });

    const res = await h.dispatch(
      mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    );

    expect(res.status).toBe(401);
  });

  test("an invalid bearer token is rejected with 401", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });

    const res = await h.dispatch(
      mcpRequest(
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { secret: "pl_pat_not-a-real-token" },
      ),
    );

    expect(res.status).toBe(401);
  });

  test("a session-cookie request is rejected — MCP authenticates by bearer PAT only", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const user = await h.factory.user.create({ role: "editor" });
    const cookieReq = await h.authenticateRequest(
      mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      user.id,
    );

    const res = await h.dispatch(cookieReq);

    expect(res.status).toBe(401);
  });
});

describe("MCP endpoint — authorization challenges", () => {
  afterEach(() => void vi.unstubAllEnvs());

  const toolsList = { jsonrpc: "2.0", id: 1, method: "tools/list" };

  function challengeParams(res: Response): Record<string, string> {
    const header = res.headers.get("www-authenticate") ?? "";
    expect(header).toMatch(/^Bearer /);
    const params: Record<string, string> = {};
    for (const [, key, value] of header.matchAll(/(\w+)="([^"]*)"/g)) {
      if (key !== undefined && value !== undefined) params[key] = value;
    }
    return params;
  }

  test("a tokenless call points at the resource metadata and the scopes", async () => {
    const h = await mcpHarness();

    const res = await h.dispatch(mcpRequest(toolsList));

    expect(res.status).toBe(401);
    expect(challengeParams(res)).toMatchObject({
      error: "invalid_token",
      scope: "read draft full",
      resource_metadata:
        "https://cms.example/.well-known/oauth-protected-resource/_plumix/mcp",
    });
  });

  test("under a base path the challenge names the mounted metadata URL", async () => {
    const h = await mcpHarness({ config: { basePath: "/blog" } });

    const res = await h.dispatch(
      mcpRequest(toolsList, { url: "https://cms.example/blog/_plumix/mcp" }),
    );

    expect(challengeParams(res).resource_metadata).toBe(
      "https://cms.example/.well-known/oauth-protected-resource/blog/_plumix/mcp",
    );
  });

  const publisher = definePlugin("test-publisher", {
    setup: (ctx) => {
      ctx.registerMcpTool({
        name: "publish_thing",
        description: "Test-only: needs the publish capability.",
        inputSchema: v.object({}),
        capability: "entry:post:publish",
        run: () => ({ published: true }),
      });
      ctx.registerMcpTool({
        name: "draft_thing",
        description: "Test-only: needs a draft capability.",
        inputSchema: v.object({}),
        capability: "entry:post:edit_own",
        run: () => ({ drafted: true }),
      });
      ctx.registerMcpTool({
        name: "read_thing",
        description: "Test-only: needs a read capability.",
        inputSchema: v.object({}),
        capability: "entry:post:read",
        run: () => ({ read: true }),
      });
    },
  });

  function toolCall(name: string): Record<string, unknown> {
    return {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: {} },
    };
  }

  test("a tool call the token's capabilities don't cover asks for the scope that does", async () => {
    const h = await mcpHarness({ config: { plugins: [blog, publisher] } });
    const secret = await mintPat(h, { scopes: ["entry:post:read"] });

    const publish = await h.dispatch(
      mcpRequest(toolCall("publish_thing"), { secret }),
    );
    const draft = await h.dispatch(
      mcpRequest(toolCall("draft_thing"), { secret }),
    );

    expect(publish.status).toBe(403);
    expect(challengeParams(publish)).toMatchObject({
      error: "insufficient_scope",
      scope: "full",
      resource_metadata:
        "https://cms.example/.well-known/oauth-protected-resource/_plumix/mcp",
    });
    expect(draft.status).toBe(403);
    expect(challengeParams(draft).scope).toBe("draft");
  });

  test("a read capability the token lacks asks for the read scope", async () => {
    const h = await mcpHarness({ config: { plugins: [blog, publisher] } });
    const secret = await mintPat(h, { scopes: ["entry:post:edit_own"] });

    const res = await h.dispatch(
      mcpRequest(toolCall("read_thing"), { secret }),
    );

    expect(res.status).toBe(403);
    expect(challengeParams(res).scope).toBe("read");
  });

  test("a dev-trusted call carries no token, so it is never challenged", async () => {
    vi.stubEnv("PLUMIX_DEV", "1");
    const h = await mcpHarness({ config: { plugins: [blog, publisher] } });

    const res = await h.dispatch(
      mcpRequest(toolCall("publish_thing"), {
        url: "http://localhost/_plumix/mcp",
      }),
    );

    expect(res.status).toBe(200);
  });

  test("a 2026-07-28 tool call is challenged the same way", async () => {
    const h = await mcpHarness({ config: { plugins: [blog, publisher] } });
    const secret = await mintPat(h, { scopes: ["entry:post:read"] });

    const res = await h.dispatch(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "publish_thing",
            arguments: {},
            _meta: {
              [PROTOCOL_VERSION_META_KEY]: "2026-07-28",
              [CLIENT_CAPABILITIES_META_KEY]: {},
            },
          },
        },
        {
          secret,
          headers: {
            "mcp-protocol-version": "2026-07-28",
            "mcp-method": "tools/call",
            "mcp-name": "publish_thing",
          },
        },
      ),
    );

    expect(res.status).toBe(403);
    expect(challengeParams(res)).toMatchObject({
      error: "insufficient_scope",
      scope: "full",
    });
  });

  test("a token that holds the capability runs the tool", async () => {
    const h = await mcpHarness({ config: { plugins: [blog, publisher] } });
    const secret = await mintPat(h);

    const { res, json } = await callTool(h, secret, 1, "publish_thing", {});

    expect(res.status).toBe(200);
    expect(parseToolResult(json)).toEqual({ published: true });
  });
});

describe("MCP endpoint — audience-bound tokens", () => {
  async function mintBound(
    h: DispatcherHarness,
    audience: string,
  ): Promise<string> {
    const user = await h.factory.user.create({ role: "editor" });
    const { secret } = await h.factory.apiToken.create({
      userId: user.id,
      audience,
      clientId: "https://client.example/oauth/metadata.json",
    });
    return secret;
  }

  const toolsList = { jsonrpc: "2.0", id: 1, method: "tools/list" };

  test("a token bound to this site's MCP URL authenticates", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const secret = await mintBound(h, "https://cms.example/_plumix/mcp");

    const res = await h.dispatch(mcpRequest(toolsList, { secret }));

    expect(res.status).toBe(200);
  });

  test("a token bound to another URL is refused with 401", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const secret = await mintBound(h, "https://other.example/_plumix/mcp");

    const res = await h.dispatch(mcpRequest(toolsList, { secret }));

    expect(res.status).toBe(401);
  });

  test("under a base path the audience is the mounted MCP URL", async () => {
    const h = await mcpHarness({
      config: { plugins: [blog], basePath: "/blog" },
    });
    const mounted = await mintBound(h, "https://cms.example/blog/_plumix/mcp");
    const unmounted = await mintBound(h, "https://cms.example/_plumix/mcp");
    const url = "https://cms.example/blog/_plumix/mcp";

    const ok = await h.dispatch(
      mcpRequest(toolsList, { secret: mounted, url }),
    );
    const refused = await h.dispatch(
      mcpRequest(toolsList, { secret: unmounted, url }),
    );

    expect(ok.status).toBe(200);
    expect(refused.status).toBe(401);
  });
});

describe("MCP endpoint — protected-resource metadata", () => {
  interface ProtectedResourceMetadata {
    readonly resource: string;
    readonly authorization_servers: readonly string[];
    readonly scopes_supported: readonly string[];
  }

  async function metadataAt(
    h: DispatcherHarness,
    url: string,
  ): Promise<{ status: number; body: ProtectedResourceMetadata }> {
    const res = await h.dispatch(new Request(url));
    return {
      status: res.status,
      body: (await res.json()) as ProtectedResourceMetadata,
    };
  }

  test("the path-specific well-known URI names the MCP URL and the site as its issuer", async () => {
    const h = await mcpHarness();

    const { status, body } = await metadataAt(
      h,
      "https://cms.example/.well-known/oauth-protected-resource/_plumix/mcp",
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({
      resource: "https://cms.example/_plumix/mcp",
      authorization_servers: ["https://cms.example"],
      scopes_supported: ["read", "draft", "full"],
    });
  });

  test("the root well-known URI serves the same document", async () => {
    const h = await mcpHarness();

    const { status, body } = await metadataAt(
      h,
      "https://cms.example/.well-known/oauth-protected-resource",
    );

    expect(status).toBe(200);
    expect(body.resource).toBe("https://cms.example/_plumix/mcp");
  });

  test.each([
    "https://cms.example/.well-known/oauth-protected-resource/blog/_plumix/mcp",
    "https://cms.example/.well-known/oauth-protected-resource",
  ])("under a base path, %s names the mounted MCP URL", async (url) => {
    const h = await mcpHarness({ config: { basePath: "/blog" } });

    const { status, body } = await metadataAt(h, url);

    expect(status).toBe(200);
    expect(body).toMatchObject({
      resource: "https://cms.example/blog/_plumix/mcp",
      authorization_servers: ["https://cms.example/blog"],
    });
  });

  test("behind a TLS-terminating proxy the issuer and resource are https", async () => {
    const h = await mcpHarness();
    const proxied = new Request(
      "http://10.0.0.5:8080/.well-known/oauth-protected-resource/_plumix/mcp",
      {
        headers: {
          "x-forwarded-proto": "https",
          "x-forwarded-host": "cms.example",
        },
      },
    );
    const { url } = trustRequest(
      proxied,
      { scheme: "http", port: 8080 },
      { trustProxy: true },
    );

    const { body } = await metadataAt(h, url.href);

    expect(body).toMatchObject({
      resource: "https://cms.example/_plumix/mcp",
      authorization_servers: ["https://cms.example"],
    });
  });

  test("a site with MCP off advertises no protected resource", async () => {
    const h = await createDispatcherHarness();

    const res = await h.dispatch(
      new Request(
        "https://cms.example/.well-known/oauth-protected-resource/_plumix/mcp",
      ),
    );

    expect(res.status).toBe(404);
    expect(res.headers.get("x-plumix-hint")).toBe("mcp-disabled");
  });
});

describe("MCP endpoint — dev trust", () => {
  afterEach(() => void vi.unstubAllEnvs());

  test("a loopback request with no token reaches the tool registry", async () => {
    vi.stubEnv("PLUMIX_DEV", "1");
    const h = await mcpHarness({ config: { plugins: [blog] } });

    const res = await h.dispatch(
      mcpRequest(
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { url: "http://localhost/_plumix/mcp" },
      ),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as JsonRpcEnvelope<{
      tools: ToolDescriptor[];
    }>;
    expect(json.result.tools.some((t) => t.name === "schema_describe")).toBe(
      true,
    );
  });

  test("a loopback Origin is allowed on the frictionless path", async () => {
    vi.stubEnv("PLUMIX_DEV", "1");
    const h = await mcpHarness({ config: { plugins: [blog] } });

    const res = await h.dispatch(
      mcpRequest(
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        {
          url: "http://localhost/_plumix/mcp",
          origin: "http://127.0.0.1:5173",
        },
      ),
    );

    expect(res.status).toBe(200);
  });

  test("a cross-origin request is rejected even in dev", async () => {
    vi.stubEnv("PLUMIX_DEV", "1");
    const h = await mcpHarness({ config: { plugins: [blog] } });

    const res = await h.dispatch(
      mcpRequest(
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        {
          url: "http://localhost/_plumix/mcp",
          origin: "https://evil.example",
        },
      ),
    );

    expect(res.status).toBe(403);
  });

  test("a non-loopback bind falls back to token auth (no token → 401)", async () => {
    vi.stubEnv("PLUMIX_DEV", "1");
    const h = await mcpHarness({ config: { plugins: [blog] } });

    const res = await h.dispatch(
      mcpRequest(
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { url: "https://cms.example/_plumix/mcp" },
      ),
    );

    expect(res.status).toBe(401);
  });

  test("dev auto-enables the endpoint with no config flag", async () => {
    // No `mcp: { enabled: true }` — the dev signal alone mounts the endpoint.
    vi.stubEnv("PLUMIX_DEV", "1");
    const h = await createDispatcherHarness({ config: { plugins: [blog] } });

    const res = await h.dispatch(
      mcpRequest(
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { url: "http://localhost/_plumix/mcp" },
      ),
    );

    expect(res.status).toBe(200);
  });

  test("production (dev trust off) still requires a token over loopback", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });

    const res = await h.dispatch(
      mcpRequest(
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { url: "http://localhost/_plumix/mcp" },
      ),
    );

    expect(res.status).toBe(401);
  });
});

interface ContentRow {
  readonly slug: string;
  readonly status: string;
}

describe("MCP endpoint — content_list", () => {
  test("returns the entries the caller may see", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const author = await h.factory.user.create({ role: "editor" });
    await h.factory.published.create({ authorId: author.id, slug: "pub" });
    await h.factory.draft.create({ authorId: author.id, slug: "draft" });
    const secret = await mintPat(h, { role: "editor" });

    const { json } = await callTool(h, secret, 1, "content_list", {
      type: "post",
    });

    const rows = parseToolResult<ContentRow[]>(json);
    expect(rows.map((r) => r.slug).sort()).toEqual(["draft", "pub"]);
  });

  test("a read-scoped token cannot see drafts (capability clamp)", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const author = await h.factory.user.create({ role: "editor" });
    await h.factory.published.create({ authorId: author.id, slug: "pub" });
    await h.factory.draft.create({ authorId: author.id, slug: "secret" });
    const secret = await mintPat(h, {
      role: "editor",
      scopes: ["entry:post:read"],
    });

    const { json } = await callTool(h, secret, 1, "content_list", {
      type: "post",
    });

    const rows = parseToolResult<ContentRow[]>(json);
    expect(rows.map((r) => r.slug)).toEqual(["pub"]);
  });

  test("content_list appears in tools/list with a projected JSON Schema", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const secret = await mintPat(h);

    const { json } = await callMcp<{
      tools: { name: string; inputSchema: { properties?: object } }[];
    }>(h, secret, { jsonrpc: "2.0", id: 1, method: "tools/list" });

    const tool = json.result.tools.find((t) => t.name === "content_list");
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.properties).toHaveProperty("status");
  });
});

describe("MCP endpoint — content_get", () => {
  test("returns a single entry by type + id", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const author = await h.factory.user.create({ role: "editor" });
    const entry = await h.factory.published.create({
      authorId: author.id,
      slug: "pub",
    });
    const secret = await mintPat(h, { role: "editor" });

    const { json } = await callTool(h, secret, 1, "content_get", {
      type: "post",
      id: entry.id,
    });

    expect(parseToolResult<ContentRow>(json).slug).toBe("pub");
  });

  test("a missing entry comes back as a not_found envelope", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const secret = await mintPat(h, { role: "editor" });

    const { json } = await callTool(h, secret, 1, "content_get", {
      type: "post",
      id: 9999,
    });

    expect(json.result.isError).toBe(true);
    expect(json.result.content[0]?.text).toContain("not_found");
  });

  test("a type that doesn't match the entry is hidden as not_found", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const author = await h.factory.user.create({ role: "editor" });
    const entry = await h.factory.published.create({
      authorId: author.id,
      slug: "pub",
    });
    const secret = await mintPat(h, { role: "editor" });

    const { json } = await callTool(h, secret, 1, "content_get", {
      type: "page",
      id: entry.id,
    });

    expect(json.result.isError).toBe(true);
    expect(json.result.content[0]?.text).toContain("not_found");
  });
});

describe("MCP endpoint — term tools", () => {
  test("term_list returns terms in a taxonomy", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    await h.factory.category.create({ name: "News", slug: "news" });
    const secret = await mintPat(h, { role: "editor" });

    const { json } = await callTool(h, secret, 1, "term_list", {
      taxonomy: "category",
    });

    const rows = parseToolResult<{ slug: string }[]>(json);
    expect(rows.map((r) => r.slug)).toEqual(["news"]);
  });

  test("term_list maps a forbidden read to an envelope", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const secret = await mintPat(h, {
      role: "editor",
      scopes: ["entry:post:read"],
    });

    const { json } = await callTool(h, secret, 1, "term_list", {
      taxonomy: "category",
    });

    expect(json.result.isError).toBe(true);
    expect(json.result.content[0]?.text).toContain("forbidden");
  });

  test("term_get returns a term by taxonomy + id", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const term = await h.factory.category.create({
      name: "News",
      slug: "news",
    });
    const secret = await mintPat(h, { role: "editor" });

    const { json } = await callTool(h, secret, 1, "term_get", {
      taxonomy: "category",
      id: term.id,
    });

    expect(parseToolResult<{ slug: string }>(json).slug).toBe("news");
  });

  test("term_get hides a taxonomy mismatch as not_found", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const term = await h.factory.category.create({
      name: "News",
      slug: "news",
    });
    const secret = await mintPat(h, { role: "editor" });

    const { json } = await callTool(h, secret, 1, "term_get", {
      taxonomy: "post_tag",
      id: term.id,
    });

    expect(json.result.isError).toBe(true);
    expect(json.result.content[0]?.text).toContain("not_found");
  });

  test("taxonomy_list enumerates registered taxonomies", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const secret = await mintPat(h, { role: "editor" });

    const { json } = await callTool(h, secret, 1, "taxonomy_list", {});

    const rows =
      parseToolResult<{ name: string; isHierarchical: boolean }[]>(json);
    expect(rows).toContainEqual(
      expect.objectContaining({ name: "category", isHierarchical: true }),
    );
  });
});

describe("MCP endpoint — telemetry", () => {
  test("a tools/call produces an mcp span plus the bearer auth span in the snapshot", async () => {
    const snapshots: TelemetrySnapshot[] = [];
    const h = await mcpHarness({
      config: {
        plugins: [blog],
        telemetry: {
          consumers: [
            { id: "in-test", onRequestEnd: (s) => void snapshots.push(s) },
          ],
        },
      },
    });
    const secret = await mintPat(h);

    await callTool(h, secret, 1, "schema_describe", {});
    await h.drainDeferred();

    const [snapshot] = snapshots;
    const spans = flattenSpans(snapshot?.spans ?? []);
    const tool = spans.find((s) => s.name === "mcp: schema_describe");
    expect(tool?.status).toBe("ok");
    expect(tool?.attributes).toEqual({ "mcp.tool": "schema_describe" });
    const auth = spans.find((s) => s.name === "auth");
    expect(auth?.attributes["auth.authenticated"]).toBe(true);
  });
});

interface RequestListRow {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly durationMs: number;
}

interface RequestDetail {
  readonly context: { readonly method: string; readonly path: string };
  readonly spans: readonly TelemetrySpan[];
  readonly records?: Readonly<Record<string, unknown>>;
}

function flattenSpans(spans: readonly TelemetrySpan[]): TelemetrySpan[] {
  return spans.flatMap((span) => [span, ...flattenSpans(span.children)]);
}

/**
 * Seed the ring through the harness's own capture path (dispatch → deferred
 * onRequestEnd, flushed by drainDeferred), then read it back via the list tool.
 */
async function seedAndList(
  h: DispatcherHarness,
  secret: string,
  url: string,
): Promise<RequestListRow[]> {
  await h.dispatch(new Request(url));
  await h.drainDeferred();
  const list = await callTool(h, secret, 1, "telemetry_requests_list", {});
  return parseToolResult<RequestListRow[]>(list.json);
}

// The ring captures only under the `PLUMIX_DEV` gate, so the block seeds it
// by dispatching real requests.
describe("MCP endpoint — telemetry tracing tools (dev gate)", () => {
  beforeEach(() => void vi.stubEnv("PLUMIX_DEV", "1"));
  afterEach(() => void vi.unstubAllEnvs());

  test("telemetry_requests_list returns recent requests newest-first with id/method/path/status/duration", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const secret = await mintPat(h);

    await h.dispatch(new Request("https://cms.example/first"));
    await h.drainDeferred();
    await h.dispatch(new Request("https://cms.example/second"));
    await h.drainDeferred();

    const { json } = await callTool(
      h,
      secret,
      1,
      "telemetry_requests_list",
      {},
    );
    const rows = parseToolResult<RequestListRow[]>(json);

    // Newest-first: the last dispatched request leads.
    expect(rows[0]?.path).toBe("/second");
    expect(rows[1]?.path).toBe("/first");
    expect(rows[0]?.method).toBe("GET");
    expect(typeof rows[0]?.id).toBe("string");
    expect(typeof rows[0]?.status).toBe("number");
    expect(typeof rows[0]?.durationMs).toBe("number");
  });

  test("telemetry_request_get returns the span tree for a known id, records omitted by default", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const secret = await mintPat(h);

    const rows = await seedAndList(h, secret, "https://cms.example/");
    const id = rows[0]?.id ?? "";

    const { json } = await callTool(h, secret, 2, "telemetry_request_get", {
      id,
    });
    const detail = parseToolResult<RequestDetail>(json);

    expect(detail.context.path).toBe("/");
    expect(flattenSpans(detail.spans).some((s) => s.name === "dispatch")).toBe(
      true,
    );
    // Records are opt-in — the key is absent from the default payload.
    expect(detail.records).toBeUndefined();
  });

  test("include: ['records'] adds the records payload that is otherwise omitted", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const secret = await mintPat(h);

    const rows = await seedAndList(h, secret, "https://cms.example/");
    const id = rows[0]?.id ?? "";

    const withRecords = await callTool(h, secret, 2, "telemetry_request_get", {
      id,
      include: ["records"],
    });
    const detail = parseToolResult<RequestDetail>(withRecords.json);

    expect(detail.records).toBeDefined();
    expect(typeof detail.records).toBe("object");
  });

  test("an unknown id comes back as a not_found envelope, not a crash", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const secret = await mintPat(h);

    const { res, json } = await callTool(
      h,
      secret,
      1,
      "telemetry_request_get",
      { id: "no-such-request" },
    );

    expect(res.status).toBe(200);
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0]?.text).toContain("not_found");
  });

  test("a failing 5xx request's captured error is readable on its span", async () => {
    const h = await mcpHarness({
      config: {
        plugins: [blog],
        theme: defineTheme({
          templates: [
            fallback(() => {
              throw new Error("render kaboom");
            }),
          ],
        }),
      },
    });
    const secret = await mintPat(h);

    const seeded = await h.dispatch(new Request("https://cms.example/"));
    await h.drainDeferred();
    expect(seeded.status).toBe(500);

    const list = await callTool(h, secret, 1, "telemetry_requests_list", {});
    const failing = parseToolResult<RequestListRow[]>(list.json).find(
      (row) => row.status === 500,
    );
    expect(failing).toBeDefined();

    const { json } = await callTool(h, secret, 2, "telemetry_request_get", {
      id: failing?.id ?? "",
    });
    const detail = parseToolResult<RequestDetail>(json);

    const errored = flattenSpans(detail.spans).find(
      (span) => span.status === "error",
    );
    expect(errored?.error?.name).toBe("Error");
    expect(errored?.error?.message).toBe("render kaboom");
    expect(typeof errored?.error?.stack).toBe("string");
  });

  test("the tracing tools are advertised in tools/list under the dev gate", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const secret = await mintPat(h);

    const { json } = await callMcp<{ tools: ToolDescriptor[] }>(h, secret, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });

    const names = json.result.tools.map((t) => t.name);
    expect(names).toContain("telemetry_requests_list");
    expect(names).toContain("telemetry_request_get");
  });

  // Whoever sets `dev.bar: false` is typically the one driving the site over
  // MCP, so capture must stay on.
  test("requests are captured with the debug bar off, and the trace still resolves", async () => {
    const h = await mcpHarness({
      config: { plugins: [blog], dev: { bar: false } },
    });
    const secret = await mintPat(h);

    const rows = await seedAndList(
      h,
      secret,
      "https://cms.example/bar-off-trace",
    );
    const row = rows.find((candidate) => candidate.path === "/bar-off-trace");
    expect(row).toBeDefined();
    expect(row?.method).toBe("GET");

    const { json } = await callTool(h, secret, 2, "telemetry_request_get", {
      id: row?.id ?? "",
    });
    const detail = parseToolResult<RequestDetail>(json);
    expect(detail.context.path).toBe("/bar-off-trace");
    expect(flattenSpans(detail.spans).some((s) => s.name === "dispatch")).toBe(
      true,
    );
  });

  // With the bar off the writer is the only consumer; declining to collect
  // would hand every other reader of `ctx.telemetry` a no-op.
  test("the collector is still active on the endpoint the writer keeps out of the ring", async () => {
    const h = await mcpHarness({
      config: { plugins: [blog, spanProbe], dev: { bar: false } },
    });
    const secret = await mintPat(h);

    const { json } = await callTool(h, secret, 1, "probe_spans", {});

    expect(parseToolResult<{ spans: number }>(json).spans).toBeGreaterThan(0);
  });
});

/**
 * A superset of the server and client shapes, so one parse handles both.
 */
interface MergedErrorRow {
  readonly source: string;
  readonly level: string;
  readonly message: string;
  readonly stack?: unknown;
  readonly path?: string;
  readonly timestamp?: number;
  readonly requestId?: string;
  readonly label?: string;
}

function throwingTheme(message: string) {
  return defineTheme({
    templates: [
      fallback(() => {
        throw new Error(message);
      }),
    ],
  });
}

describe("MCP endpoint — error_list (dev gate)", () => {
  beforeEach(() => void vi.stubEnv("PLUMIX_DEV", "1"));
  afterEach(() => void vi.unstubAllEnvs());

  test("returns server failures newest-first, each tagged source=server with message/stack/path/timestamp/requestId", async () => {
    const h = await mcpHarness({
      config: { plugins: [blog], theme: throwingTheme("boom") },
    });
    const author = await h.factory.user.create({ role: "editor" });
    await h.factory.published.create({ authorId: author.id, slug: "first" });
    await h.factory.published.create({ authorId: author.id, slug: "second" });
    const secret = await mintPat(h);

    // A published post resolves and renders the throwing fallback → 500.
    const first = await h.dispatch(
      new Request("https://cms.example/post/first"),
    );
    await h.drainDeferred();
    const second = await h.dispatch(
      new Request("https://cms.example/post/second"),
    );
    await h.drainDeferred();
    expect(first.status).toBe(500);
    expect(second.status).toBe(500);

    const { json } = await callTool(h, secret, 1, "error_list", {});
    const errors = parseToolResult<MergedErrorRow[]>(json);

    // Newest-first: the last failing request leads.
    expect(errors[0]?.path).toBe("/post/second");
    expect(errors[1]?.path).toBe("/post/first");
    const entry = errors[0];
    expect(entry?.source).toBe("server");
    expect(entry?.level).toBe("error");
    expect(entry?.message).toBe("boom");
    expect(typeof entry?.stack).toBe("string");
    expect(typeof entry?.timestamp).toBe("number");
    expect(typeof entry?.requestId).toBe("string");
  });

  test("an entry's requestId resolves in telemetry_request_get to the same request's trace", async () => {
    const h = await mcpHarness({
      config: { plugins: [blog], theme: throwingTheme("pivot me") },
    });
    const author = await h.factory.user.create({ role: "editor" });
    await h.factory.published.create({ authorId: author.id, slug: "broken" });
    const secret = await mintPat(h);

    await h.dispatch(new Request("https://cms.example/post/broken"));
    await h.drainDeferred();

    const list = await callTool(h, secret, 1, "error_list", {});
    const entry = parseToolResult<MergedErrorRow[]>(list.json)[0];
    expect(entry?.path).toBe("/post/broken");

    const { json } = await callTool(h, secret, 2, "telemetry_request_get", {
      id: entry?.requestId ?? "",
    });
    const detail = parseToolResult<RequestDetail>(json);

    // The pivot lands on the same request — telemetry answers "what led to it".
    expect(detail.context.path).toBe("/post/broken");
    const errored = flattenSpans(detail.spans).find(
      (span) => span.status === "error",
    );
    expect(errored?.error?.message).toBe("pivot me");
  });

  test("an error on a defer span is listed, though the response succeeded", async () => {
    const purging = definePlugin("test-purging", {
      setup: (ctx) => {
        ctx.registerPublicRoute({
          path: "/purges",
          handler: (_request, appCtx) => {
            appCtx.defer(Promise.reject(new Error("purge refused")));
            return new Response("ok");
          },
        });
      },
    });
    const h = await mcpHarness({ config: { plugins: [blog, purging] } });
    const secret = await mintPat(h);

    const ok = await h.dispatch(new Request("https://cms.example/purges"));
    await h.drainDeferred();
    expect(ok.status).toBe(200);

    const { json } = await callTool(h, secret, 1, "error_list", {});
    const entry = parseToolResult<MergedErrorRow[]>(json).find(
      (e) => e.path === "/purges",
    );
    expect(entry).toMatchObject({
      source: "server",
      level: "error",
      message: "purge refused",
    });
  });

  test("a successful request contributes nothing — the tool returns a list, not an error", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const author = await h.factory.user.create({ role: "editor" });
    await h.factory.published.create({ authorId: author.id, slug: "healthy" });
    const secret = await mintPat(h);

    const ok = await h.dispatch(
      new Request("https://cms.example/post/healthy"),
    );
    await h.drainDeferred();
    expect(ok.status).toBe(200);

    const { res, json } = await callTool(h, secret, 1, "error_list", {});
    const errors = parseToolResult<MergedErrorRow[]>(json);

    // The ring is a process-wide singleton shared across tests, so scope to the
    // seeded path (as the telemetry-tools tests do) rather than asserting
    // global emptiness: a 2xx request is never projected as a failure, and a
    // run with no failures at all yields this same empty array.
    expect(res.status).toBe(200);
    expect(json.result.isError).toBeUndefined();
    expect(Array.isArray(errors)).toBe(true);
    expect(errors.some((e) => e.path === "/post/healthy")).toBe(false);
  });

  // The server half projects out of the same ring the tracing tools read, so it
  // carries the same exposure to the overlay being switched off.
  test("server failures are listed with the debug bar off", async () => {
    const h = await mcpHarness({
      config: {
        plugins: [blog],
        dev: { bar: false },
        theme: throwingTheme("bar-off boom"),
      },
    });
    const author = await h.factory.user.create({ role: "editor" });
    await h.factory.published.create({
      authorId: author.id,
      slug: "bar-off-error",
    });
    const secret = await mintPat(h);

    const failed = await h.dispatch(
      new Request("https://cms.example/post/bar-off-error"),
    );
    await h.drainDeferred();
    expect(failed.status).toBe(500);

    const { json } = await callTool(h, secret, 1, "error_list", {});
    const entry = parseToolResult<MergedErrorRow[]>(json).find(
      (candidate) => candidate.path === "/post/bar-off-error",
    );

    expect(entry).toBeDefined();
    expect(entry?.source).toBe("server");
    expect(entry?.message).toBe("bar-off boom");
    expect(typeof entry?.requestId).toBe("string");
  });

  test("error_list is advertised in tools/list under the dev gate", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const secret = await mintPat(h);

    const { json } = await callMcp<{ tools: ToolDescriptor[] }>(h, secret, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });

    expect(json.result.tools.map((t) => t.name)).toContain("error_list");
  });
});

/**
 * Only the client-error endpoint is intercepted, so nothing else in dispatch
 * is disturbed.
 */
function stubClientErrorEndpoint(
  respond: () => Response | Promise<Response>,
): void {
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith(DEV_ERROR_CLIENT_ERRORS_ENDPOINT)) {
      return Promise.resolve(respond());
    }
    return realFetch(input, init);
  });
}

function clientErrorsResponse(entries: readonly unknown[]): Response {
  return new Response(JSON.stringify({ errors: entries }), {
    headers: { "content-type": "application/json" },
  });
}

describe("MCP endpoint — error_list client merge (dev gate)", () => {
  beforeEach(() => void vi.stubEnv("PLUMIX_DEV", "1"));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  test("merges client entries from the dev endpoint with server entries, each client entry source=client with level/message/stack/label and no requestId", async () => {
    const h = await mcpHarness({
      config: { plugins: [blog], theme: throwingTheme("server boom") },
    });
    const author = await h.factory.user.create({ role: "editor" });
    await h.factory.published.create({ authorId: author.id, slug: "srv" });
    const secret = await mintPat(h);

    stubClientErrorEndpoint(() =>
      clientErrorsResponse([
        {
          source: "client",
          level: "error",
          message: "client kaboom",
          stack: [{ file: "/app/src/Counter.tsx", line: 12, isVendor: false }],
          label: "Counter",
          // Server-only fields a malformed producer might send: the merge must
          // field-pick, not spread, so neither rides onto the client entry.
          requestId: "should-be-stripped",
          path: "/should-be-stripped",
        },
      ]),
    );

    // Seed a server 5xx so both sources contribute to the merged stream.
    const seeded = await h.dispatch(
      new Request("https://cms.example/post/srv"),
    );
    await h.drainDeferred();
    expect(seeded.status).toBe(500);

    const { res, json } = await callTool(h, secret, 1, "error_list", {});
    const errors = parseToolResult<MergedErrorRow[]>(json);

    expect(res.status).toBe(200);
    expect(json.result.isError).toBeUndefined();

    const client = errors.find((e) => e.message === "client kaboom");
    expect(client?.source).toBe("client");
    expect(client?.level).toBe("error");
    expect(client?.label).toBe("Counter");
    expect(client?.stack).toEqual([
      { file: "/app/src/Counter.tsx", line: 12, isVendor: false },
    ]);
    // A client failure has no server request behind it — the merge strips any
    // server-only field the producer sent rather than leaking it through.
    expect(client?.requestId).toBeUndefined();
    expect(client?.path).toBeUndefined();

    // The server projection is still present and unchanged, carrying its pivot.
    const server = errors.find((e) => e.path === "/post/srv");
    expect(server?.source).toBe("server");
    expect(server?.message).toBe("server boom");
    expect(typeof server?.requestId).toBe("string");
  });

  test("a captured hydration error is readable through error_list and names the offending component", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const secret = await mintPat(h);

    stubClientErrorEndpoint(() =>
      clientErrorsResponse([
        {
          source: "client",
          level: "error",
          message:
            "Hydration failed because the server rendered HTML didn't match the client",
          stack: [
            { file: "/app/src/islands/Widget.tsx", line: 4, isVendor: false },
          ],
          label: "Widget",
        },
      ]),
    );

    const { json } = await callTool(h, secret, 1, "error_list", {});
    const errors = parseToolResult<MergedErrorRow[]>(json);

    const hydration = errors.find((e) =>
      e.message.includes("Hydration failed"),
    );
    expect(hydration?.source).toBe("client");
    expect(hydration?.label).toBe("Widget");
  });

  test("client entries lead the stream, ahead of the server projection", async () => {
    const h = await mcpHarness({
      config: { plugins: [blog], theme: throwingTheme("later server boom") },
    });
    const author = await h.factory.user.create({ role: "editor" });
    await h.factory.published.create({ authorId: author.id, slug: "lead" });
    const secret = await mintPat(h);

    stubClientErrorEndpoint(() =>
      clientErrorsResponse([
        {
          source: "client",
          level: "error",
          message: "front of line",
          stack: [],
        },
      ]),
    );

    const seeded = await h.dispatch(
      new Request("https://cms.example/post/lead"),
    );
    await h.drainDeferred();
    expect(seeded.status).toBe(500);

    const { json } = await callTool(h, secret, 1, "error_list", {});
    const errors = parseToolResult<MergedErrorRow[]>(json);

    // The client run (freshly fetched, no per-entry clock) is concatenated
    // ahead of the server run, so a client entry leads.
    expect(errors[0]?.source).toBe("client");
    expect(errors[0]?.message).toBe("front of line");
  });

  test("when the client endpoint is unavailable, error_list still returns the server entries (degrades, does not fail)", async () => {
    const h = await mcpHarness({
      config: { plugins: [blog], theme: throwingTheme("degrade boom") },
    });
    const author = await h.factory.user.create({ role: "editor" });
    await h.factory.published.create({ authorId: author.id, slug: "degrade" });
    const secret = await mintPat(h);

    stubClientErrorEndpoint(() =>
      Promise.reject(new Error("dev endpoint down")),
    );

    const seeded = await h.dispatch(
      new Request("https://cms.example/post/degrade"),
    );
    await h.drainDeferred();
    expect(seeded.status).toBe(500);

    const { res, json } = await callTool(h, secret, 1, "error_list", {});
    const errors = parseToolResult<MergedErrorRow[]>(json);

    expect(res.status).toBe(200);
    expect(json.result.isError).toBeUndefined();
    const server = errors.find((e) => e.path === "/post/degrade");
    expect(server?.source).toBe("server");
    expect(server?.message).toBe("degrade boom");
  });

  test("a non-200 from the client endpoint degrades to server-only, not an error", async () => {
    const h = await mcpHarness({
      config: { plugins: [blog], theme: throwingTheme("status boom") },
    });
    const author = await h.factory.user.create({ role: "editor" });
    await h.factory.published.create({ authorId: author.id, slug: "status" });
    const secret = await mintPat(h);

    stubClientErrorEndpoint(() => new Response("nope", { status: 503 }));

    const seeded = await h.dispatch(
      new Request("https://cms.example/post/status"),
    );
    await h.drainDeferred();
    expect(seeded.status).toBe(500);

    const { json } = await callTool(h, secret, 1, "error_list", {});
    const errors = parseToolResult<MergedErrorRow[]>(json);

    expect(json.result.isError).toBeUndefined();
    expect(errors.some((e) => e.path === "/post/status")).toBe(true);
  });

  test("a malformed row is dropped and a valid one survives; a missing stack defaults to empty", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const secret = await mintPat(h);

    stubClientErrorEndpoint(() =>
      clientErrorsResponse([
        // Not an object → dropped.
        "not an entry",
        // Non-string message → dropped (the field-pick's essentials guard).
        { source: "client", level: "error", message: 42 },
        // Valid but with no stack → survives with an empty frame list.
        { source: "client", level: "warn", message: "stackless survivor" },
      ]),
    );

    const { json } = await callTool(h, secret, 1, "error_list", {});
    const errors = parseToolResult<MergedErrorRow[]>(json);

    const survivors = errors.filter((e) => e.source === "client");
    expect(survivors).toHaveLength(1);
    expect(survivors[0]?.message).toBe("stackless survivor");
    expect(survivors[0]?.stack).toEqual([]);
  });

  test("a non-array errors body degrades to server-only, not an error", async () => {
    const h = await mcpHarness({
      config: { plugins: [blog], theme: throwingTheme("shape boom") },
    });
    const author = await h.factory.user.create({ role: "editor" });
    await h.factory.published.create({ authorId: author.id, slug: "shape" });
    const secret = await mintPat(h);

    // A well-formed 200 whose body is the wrong shape (no `errors` array).
    stubClientErrorEndpoint(
      () =>
        new Response(JSON.stringify({ errors: "nope" }), {
          headers: { "content-type": "application/json" },
        }),
    );

    const seeded = await h.dispatch(
      new Request("https://cms.example/post/shape"),
    );
    await h.drainDeferred();
    expect(seeded.status).toBe(500);

    const { json } = await callTool(h, secret, 1, "error_list", {});
    const errors = parseToolResult<MergedErrorRow[]>(json);

    expect(json.result.isError).toBeUndefined();
    expect(errors.some((e) => e.source === "client")).toBe(false);
    expect(errors.some((e) => e.path === "/post/shape")).toBe(true);
  });
});

describe("MCP endpoint — telemetry tracing tools absent in production", () => {
  // Force the gate off regardless of an ambient PLUMIX_DEV, so the assertion
  // is deterministic in any environment — an empty string is falsy.
  beforeEach(() => void vi.stubEnv("PLUMIX_DEV", ""));
  afterEach(() => void vi.unstubAllEnvs());

  test("without the dev gate the tracing and error tools are not registered", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const secret = await mintPat(h);

    const { json } = await callMcp<{ tools: ToolDescriptor[] }>(h, secret, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });

    const names = json.result.tools.map((t) => t.name);
    expect(names).not.toContain("telemetry_requests_list");
    expect(names).not.toContain("telemetry_request_get");
    expect(names).not.toContain("error_list");
    // The always-on core tools are unaffected by the gate.
    expect(names).toContain("schema_describe");
  });
});

describe("MCP endpoint — freshness", () => {
  test("a tools/list answer declares no-store", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const secret = await mintPat(h);

    const res = await h.dispatch(
      mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { secret }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("a wrong-method refusal declares no-store", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });
    const secret = await mintPat(h);

    const res = await h.dispatch(mcpRequest({}, { secret, method: "GET" }));

    expect(res.status).toBe(405);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("a missing token declares no-store", async () => {
    const h = await mcpHarness({ config: { plugins: [blog] } });

    const res = await h.dispatch(
      mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    );

    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

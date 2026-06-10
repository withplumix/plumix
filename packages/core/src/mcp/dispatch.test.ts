import { describe, expect, test } from "vitest";

import type { UserRole } from "../db/schema/users.js";
import type { DispatcherHarness } from "../test/dispatcher.js";
import { createApiToken } from "../auth/api-tokens.js";
import { definePlugin } from "../plugin/define.js";
import { createDispatcherHarness } from "../test/dispatcher.js";

const blog = definePlugin("test-blog", (ctx) => {
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
  readonly annotations: { readonly readOnlyHint: boolean };
}

interface ToolCallResult {
  readonly content: readonly { readonly type: string; readonly text: string }[];
  readonly isError?: boolean;
}

interface ContentModel {
  readonly entryTypes: readonly Record<string, unknown>[];
  readonly taxonomies: readonly Record<string, unknown>[];
}

async function mintPat(
  h: DispatcherHarness,
  {
    role = "editor",
    scopes = null,
  }: { role?: UserRole; scopes?: string[] | null } = {},
): Promise<string> {
  const user = await h.factory.user.create({ role });
  const { secret } = await createApiToken(h.db, {
    userId: user.id,
    name: "mcp-test",
    expiresAt: null,
    scopes,
  });
  return secret;
}

function mcpRequest(
  body: unknown,
  init: { secret?: string; method?: string } = {},
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (init.secret) headers.authorization = `Bearer ${init.secret}`;
  const method = init.method ?? "POST";
  return new Request("https://cms.example/_plumix/mcp", {
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
    const h = await createDispatcherHarness({ plugins: [blog] });
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

describe("MCP endpoint — schema_describe", () => {
  test("with no argument it lists entry types and taxonomies", async () => {
    const h = await createDispatcherHarness({ plugins: [blog] });
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
    const h = await createDispatcherHarness({ plugins: [blog] });
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
    const h = await createDispatcherHarness({ plugins: [blog] });
    const secret = await mintPat(h);

    const { res, json } = await callTool(h, secret, 4, "schema_describe", {
      type: "nope",
    });

    expect(res.status).toBe(200);
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0]?.text).toContain("not_found");
    expect(json.result.content[0]?.text).toContain("nope");
  });
});

describe("MCP endpoint — transport guards", () => {
  test.each(["GET", "DELETE"])(
    "%s is rejected with 405 (the endpoint is POST-only)",
    async (method) => {
      const h = await createDispatcherHarness({ plugins: [blog] });
      const secret = await mintPat(h);

      const res = await h.dispatch(mcpRequest({}, { secret, method }));

      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
    },
  );

  test("a request without a bearer token is rejected with 401", async () => {
    const h = await createDispatcherHarness({ plugins: [blog] });

    const res = await h.dispatch(
      mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    );

    expect(res.status).toBe(401);
  });

  test("an invalid bearer token is rejected with 401", async () => {
    const h = await createDispatcherHarness({ plugins: [blog] });

    const res = await h.dispatch(
      mcpRequest(
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { secret: "pl_pat_not-a-real-token" },
      ),
    );

    expect(res.status).toBe(401);
  });

  test("a session-cookie request is rejected — MCP authenticates by bearer PAT only", async () => {
    const h = await createDispatcherHarness({ plugins: [blog] });
    const user = await h.factory.user.create({ role: "editor" });
    const cookieReq = await h.authenticateRequest(
      mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      user.id,
    );

    const res = await h.dispatch(cookieReq);

    expect(res.status).toBe(401);
  });
});

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { TelemetrySnapshot, TelemetrySpan } from "../context/telemetry.js";
import type { UserRole } from "../db/schema/users.js";
import type { DispatcherHarness } from "../test/dispatcher.js";
import { definePlugin } from "../plugin/define.js";
import { fallback } from "../route/render/template-builders.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { defineTheme } from "../theme.js";

// MCP is default-off; every test in this suite exercises the live endpoint,
// so opt it in here rather than repeating `mcp: { enabled: true }` per call.
function mcpHarness(
  options: Parameters<typeof createDispatcherHarness>[0] = {},
): Promise<DispatcherHarness> {
  return createDispatcherHarness({ mcp: { enabled: true }, ...options });
}

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
  } = {},
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
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
    const h = await mcpHarness({ plugins: [blog] });
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
    const h = await mcpHarness({ plugins: [blog] });
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
    const h = await mcpHarness({ plugins: [blog] });
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
    const h = await mcpHarness({ plugins: [blog] });
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
      const h = await mcpHarness({ plugins: [blog] });
      const secret = await mintPat(h);

      const res = await h.dispatch(mcpRequest({}, { secret, method }));

      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
    },
  );

  test("a request without a bearer token is rejected with 401", async () => {
    const h = await mcpHarness({ plugins: [blog] });

    const res = await h.dispatch(
      mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    );

    expect(res.status).toBe(401);
  });

  test("an invalid bearer token is rejected with 401", async () => {
    const h = await mcpHarness({ plugins: [blog] });

    const res = await h.dispatch(
      mcpRequest(
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { secret: "pl_pat_not-a-real-token" },
      ),
    );

    expect(res.status).toBe(401);
  });

  test("a session-cookie request is rejected — MCP authenticates by bearer PAT only", async () => {
    const h = await mcpHarness({ plugins: [blog] });
    const user = await h.factory.user.create({ role: "editor" });
    const cookieReq = await h.authenticateRequest(
      mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      user.id,
    );

    const res = await h.dispatch(cookieReq);

    expect(res.status).toBe(401);
  });
});

// Dev-trust: over loopback a dev server auto-enables the endpoint and trusts the
// local developer with no PAT, guarded by an Origin allowlist and a loopback
// bind. Production (devCsrfLocalhost off) keeps the token requirement unchanged.
describe("MCP endpoint — dev trust", () => {
  test("a loopback request with no token reaches the tool registry", async () => {
    const h = await mcpHarness({ plugins: [blog], devCsrfLocalhost: true });

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
    const h = await mcpHarness({ plugins: [blog], devCsrfLocalhost: true });

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
    const h = await mcpHarness({ plugins: [blog], devCsrfLocalhost: true });

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
    const h = await mcpHarness({ plugins: [blog], devCsrfLocalhost: true });

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
    const h = await createDispatcherHarness({
      plugins: [blog],
      devCsrfLocalhost: true,
    });

    const res = await h.dispatch(
      mcpRequest(
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { url: "http://localhost/_plumix/mcp" },
      ),
    );

    expect(res.status).toBe(200);
  });

  test("production (dev trust off) still requires a token over loopback", async () => {
    const h = await mcpHarness({ plugins: [blog] });

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
    const h = await mcpHarness({ plugins: [blog] });
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
    const h = await mcpHarness({ plugins: [blog] });
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
    const h = await mcpHarness({ plugins: [blog] });
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
    const h = await mcpHarness({ plugins: [blog] });
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
    const h = await mcpHarness({ plugins: [blog] });
    const secret = await mintPat(h, { role: "editor" });

    const { json } = await callTool(h, secret, 1, "content_get", {
      type: "post",
      id: 9999,
    });

    expect(json.result.isError).toBe(true);
    expect(json.result.content[0]?.text).toContain("not_found");
  });

  test("a type that doesn't match the entry is hidden as not_found", async () => {
    const h = await mcpHarness({ plugins: [blog] });
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
    const h = await mcpHarness({ plugins: [blog] });
    await h.factory.category.create({ name: "News", slug: "news" });
    const secret = await mintPat(h, { role: "editor" });

    const { json } = await callTool(h, secret, 1, "term_list", {
      taxonomy: "category",
    });

    const rows = parseToolResult<{ slug: string }[]>(json);
    expect(rows.map((r) => r.slug)).toEqual(["news"]);
  });

  test("term_list maps a forbidden read to an envelope", async () => {
    const h = await mcpHarness({ plugins: [blog] });
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
    const h = await mcpHarness({ plugins: [blog] });
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
    const h = await mcpHarness({ plugins: [blog] });
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
    const h = await mcpHarness({ plugins: [blog] });
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
      plugins: [blog],
      telemetry: {
        consumers: [
          { id: "in-test", onRequestEnd: (s) => void snapshots.push(s) },
        ],
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

// Seed the ring through the harness's own capture path (dispatch → deferred
// onRequestEnd, flushed by drainDeferred), then read it back via the list tool.
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

// The tracing tools read the debug request-history ring, which only captures
// under the `PLUMIX_DEV` gate — the same gate that registers the tools. So the
// whole block runs with the dev signal on and seeds the ring by dispatching
// real requests through the harness's own capture path (drainDeferred flushes
// the deferred `onRequestEnd` write).
describe("MCP endpoint — telemetry tracing tools (dev gate)", () => {
  beforeEach(() => void vi.stubEnv("PLUMIX_DEV", "1"));
  afterEach(() => void vi.unstubAllEnvs());

  test("telemetry_requests_list returns recent requests newest-first with id/method/path/status/duration", async () => {
    const h = await mcpHarness({ plugins: [blog] });
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
    const h = await mcpHarness({ plugins: [blog] });
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
    const h = await mcpHarness({ plugins: [blog] });
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
    const h = await mcpHarness({ plugins: [blog] });
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
      plugins: [blog],
      theme: defineTheme({
        templates: [
          fallback(() => {
            throw new Error("render kaboom");
          }),
        ],
      }),
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
    const h = await mcpHarness({ plugins: [blog] });
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
});

describe("MCP endpoint — telemetry tracing tools absent in production", () => {
  // Force the gate off regardless of an ambient PLUMIX_DEV, so the assertion
  // is deterministic in any environment — an empty string is falsy.
  beforeEach(() => void vi.stubEnv("PLUMIX_DEV", ""));
  afterEach(() => void vi.unstubAllEnvs());

  test("without the dev gate the tracing tools are not registered", async () => {
    const h = await mcpHarness({ plugins: [blog] });
    const secret = await mintPat(h);

    const { json } = await callMcp<{ tools: ToolDescriptor[] }>(h, secret, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });

    const names = json.result.tools.map((t) => t.name);
    expect(names).not.toContain("telemetry_requests_list");
    expect(names).not.toContain("telemetry_request_get");
    // The always-on core tools are unaffected by the gate.
    expect(names).toContain("schema_describe");
  });
});

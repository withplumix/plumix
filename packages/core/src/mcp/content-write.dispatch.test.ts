import { describe, expect, test } from "vitest";

import type { UserRole } from "../db/schema/users.js";
import type { DispatcherHarness } from "../test/dispatcher.js";
import { acquireEditLease, readEditLease } from "../db/edit-lease.js";
import { eq } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { definePlugin } from "../plugin/define.js";
import { createDispatcherHarness } from "../test/dispatcher.js";

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

interface ToolCallResult {
  readonly content: readonly { readonly type: string; readonly text: string }[];
  readonly isError?: boolean;
  readonly _meta?: { readonly code?: string };
}

function mcpHarness(): Promise<DispatcherHarness> {
  return createDispatcherHarness({
    config: { mcp: { enabled: true }, plugins: [blog] },
  });
}

async function mintPat(
  h: DispatcherHarness,
  {
    role = "editor",
    scopes = null,
    userId,
  }: { role?: UserRole; scopes?: string[] | null; userId?: number } = {},
): Promise<string> {
  const id = userId ?? (await h.factory.user.create({ role })).id;
  const { secret } = await h.factory.apiToken.create({ userId: id, scopes });
  return secret;
}

async function callTool(
  h: DispatcherHarness,
  secret: string,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const res = await h.dispatch(
    new Request("https://cms.example/_plumix/mcp", {
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
        params: { name, arguments: args },
      }),
    }),
  );
  const json = (await res.json()) as { result: ToolCallResult };
  return json.result;
}

function parsed<T>(result: ToolCallResult): T {
  return JSON.parse(result.content[0]?.text ?? "null") as T;
}

interface Written {
  readonly id: number;
  readonly etag: string;
  readonly status: string;
}

async function rowOf(h: DispatcherHarness, id: number) {
  const [row] = await h.db.select().from(entries).where(eq(entries.id, id));
  return row;
}

describe("MCP content_create and content_update", () => {
  test("content_create makes a draft and content_update with its etag edits it", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);

    const created = await callTool(h, secret, "content_create", {
      type: "post",
      slug: "hello",
      title: "Hello",
    });
    const { id, etag, status } = parsed<Written>(created);

    expect(status).toBe("draft");
    expect((await rowOf(h, id))?.title).toBe("Hello");

    const updated = await callTool(h, secret, "content_update", {
      type: "post",
      id,
      ifMatch: etag,
      title: "Hello again",
      excerpt: "Short",
    });

    const next = parsed<Written>(updated);
    expect(next.id).toBe(id);
    expect(next.etag).not.toBe(etag);
    const row = await rowOf(h, id);
    expect(row?.title).toBe("Hello again");
    expect(row?.excerpt).toBe("Short");
    expect(row?.slug).toBe("hello");
  });

  async function draftOf(h: DispatcherHarness, secret: string) {
    const created = await callTool(h, secret, "content_create", {
      type: "post",
      slug: "draft",
      title: "Draft",
    });
    return parsed<Written>(created);
  }

  test("a write without ifMatch is refused", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id } = await draftOf(h, secret);

    const result = await callTool(h, secret, "content_update", {
      type: "post",
      id,
      title: "No etag",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("bad_input");
    expect(result.content[0]?.text).toContain("ifMatch");
    expect((await rowOf(h, id))?.title).toBe("Draft");
  });

  test("a stale ifMatch returns conflict with the current etag", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id, etag } = await draftOf(h, secret);
    await h.db
      .update(entries)
      .set({ updatedAt: new Date(Date.now() + 60_000) })
      .where(eq(entries.id, id));
    const current = parsed<{ etag: string }>(
      await callTool(h, secret, "content_get", { type: "post", id }),
    ).etag;

    const result = await callTool(h, secret, "content_update", {
      type: "post",
      id,
      ifMatch: etag,
      title: "Stale",
    });

    expect(result.isError).toBe(true);
    expect(result._meta?.code).toBe("conflict");
    expect(result.content[0]?.text).toContain("content_get");
    expect(result.content[0]?.text).toContain(current);
    expect(current).not.toBe(etag);
    expect((await rowOf(h, id))?.title).toBe("Draft");
  });

  test("a write while another user holds the lease returns locked and leaves it", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id, etag } = await draftOf(h, secret);
    const holder = await h.factory.user.create({
      role: "editor",
      name: "Ada Lovelace",
    });
    await acquireEditLease(
      h.db,
      { kind: "entry", id },
      { userId: holder.id, surface: "admin" },
    );

    const result = await callTool(h, secret, "content_update", {
      type: "post",
      id,
      ifMatch: etag,
      title: "Blocked",
    });

    expect(result.isError).toBe(true);
    expect(result._meta?.code).toBe("locked");
    expect(result.content[0]?.text).toContain("Ada Lovelace");
    expect(result.content[0]?.text).toContain("stop");
    expect((await rowOf(h, id))?.title).toBe("Draft");
    const lease = await readEditLease(h.db, { kind: "entry", id });
    expect(lease?.holder.id).toBe(holder.id);
    expect(lease?.surface).toBe("admin");
  });

  test("content that fails validation returns invalid_content with the node path", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id, etag } = await draftOf(h, secret);

    const result = await callTool(h, secret, "content_update", {
      type: "post",
      id,
      ifMatch: etag,
      content: {
        version: "plumix.v2",
        blocks: [{ id: "x1", name: "made-up/block", attrs: {} }],
      },
    });

    expect(result.isError).toBe(true);
    expect(result._meta?.code).toBe("invalid_content");
    expect(result.content[0]?.text).toContain("made-up/block");
    expect(result.content[0]?.text).toContain("blocks[0]");
  });

  test("a token whose scopes lack the capability is refused", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h, { scopes: ["entry:post:read"] });

    const result = await callTool(h, secret, "content_create", {
      type: "post",
      slug: "nope",
    });

    expect(result.isError).toBe(true);
    expect(result._meta?.code).toBe("forbidden");
  });

  test("a write leaves no lease held and returns only id, etag and status", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id, etag } = await draftOf(h, secret);

    const updated = await callTool(h, secret, "content_update", {
      type: "post",
      id,
      ifMatch: etag,
      title: "Leased",
    });

    expect(Object.keys(parsed<Written>(updated)).sort()).toEqual([
      "etag",
      "id",
      "status",
    ]);
    expect(await readEditLease(h.db, { kind: "entry", id })).toBeUndefined();
  });

  test("content_get returns the etag content_update accepts", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id, etag } = await draftOf(h, secret);

    const got = parsed<{ etag: string }>(
      await callTool(h, secret, "content_get", { type: "post", id }),
    );

    expect(got.etag).toBe(etag);
  });
});

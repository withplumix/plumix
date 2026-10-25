import { describe, expect, test } from "vitest";

import type { BlockSpec } from "../blocks/block-registry.js";
import type { AllowCustomStyles } from "../blocks/styles/style-policy.js";
import type { ThemeTokens } from "../blocks/styles/types.js";
import type { UserRole } from "../db/schema/users.js";
import type { DispatcherHarness } from "../test/dispatcher.js";
import { defineBlock } from "../blocks/block-registry.js";
import { acquireEditLease, readEditLease } from "../db/edit-lease.js";
import { eq } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { definePlugin } from "../plugin/define.js";
import { fallback } from "../route/render/template-builders.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { defineTheme } from "../theme.js";

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

const card = defineBlock({
  name: "site/card",
  title: "Card",
  render: () => null,
  inputs: [{ name: "body", type: "slot", allowedBlocks: ["core/rich-text"] }],
});

const tabs = defineBlock({
  name: "site/tabs",
  render: () => null,
  inputs: [{ name: "items", type: "slot" }],
});

const tab = defineBlock({
  name: "site/tab",
  render: () => null,
  requiresParent: ["site/tabs"],
});

const gated = defineBlock({
  name: "site/gated",
  render: () => null,
  capability: "entry:post:publish",
});

function themedMcpHarness(theme: {
  blocks?: readonly BlockSpec[];
  allowedBlocks?: readonly string[];
  tokens?: ThemeTokens;
  allowCustomStyles?: AllowCustomStyles;
}): Promise<DispatcherHarness> {
  return createDispatcherHarness({
    config: {
      mcp: { enabled: true },
      plugins: [blog],
      theme: defineTheme({
        templates: [fallback(() => null)],
        ...theme,
        blocks: theme.blocks ?? [card],
      }),
    },
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

async function rpc(
  h: DispatcherHarness,
  secret: string,
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const res = await h.dispatch(
    new Request("https://cms.example/_plumix/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  return ((await res.json()) as { result: unknown }).result;
}

async function callTool(
  h: DispatcherHarness,
  secret: string,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  return (await rpc(h, secret, "tools/call", {
    name,
    arguments: args,
  })) as ToolCallResult;
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

async function draftOf(h: DispatcherHarness, secret: string) {
  const created = await callTool(h, secret, "content_create", {
    type: "post",
    slug: "draft",
    title: "Draft",
  });
  return parsed<Written>(created);
}

describe("MCP content_create and content_update", () => {
  test("content_create makes a draft", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);

    const created = await callTool(h, secret, "content_create", {
      type: "post",
      slug: "hello",
      title: "Hello",
    });

    const { id, status } = parsed<Written>(created);
    expect(status).toBe("draft");
    expect((await rowOf(h, id))?.title).toBe("Hello");
  });

  test("content_update with the current etag edits only the fields it is sent", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id, etag } = await draftOf(h, secret);

    const updated = await callTool(h, secret, "content_update", {
      type: "post",
      id,
      ifMatch: etag,
      title: "Hello again",
      excerpt: "Short",
    });

    expect(parsed<Written>(updated).etag).not.toBe(etag);
    const row = await rowOf(h, id);
    expect(row?.title).toBe("Hello again");
    expect(row?.excerpt).toBe("Short");
    expect(row?.slug).toBe("draft");
  });

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
    const { id, etag: stale } = await draftOf(h, secret);
    const { etag: current } = parsed<Written>(
      await callTool(h, secret, "content_update", {
        type: "post",
        id,
        ifMatch: stale,
        title: "Newer",
      }),
    );

    const result = await callTool(h, secret, "content_update", {
      type: "post",
      id,
      ifMatch: stale,
      title: "Stale",
    });

    expect(result.isError).toBe(true);
    expect(result._meta?.code).toBe("conflict");
    expect(result.content[0]?.text).toContain("content_get");
    expect(result.content[0]?.text).toContain(current);
    expect((await rowOf(h, id))?.title).toBe("Newer");
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

  test("takeOver is not accepted, so a held lease still locks the write", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id, etag } = await draftOf(h, secret);
    const holder = await h.factory.user.create({ role: "editor" });
    await acquireEditLease(
      h.db,
      { kind: "entry", id },
      { userId: holder.id, surface: "admin" },
    );

    const result = await callTool(h, secret, "content_update", {
      type: "post",
      id,
      ifMatch: etag,
      title: "Taken",
      takeOver: true,
    });

    expect(result._meta?.code).toBe("locked");
    expect((await readEditLease(h.db, { kind: "entry", id }))?.holder.id).toBe(
      holder.id,
    );
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
    expect(result.content[0]?.text).toContain("content_update");
  });

  test("invalid content on update tells the agent to fix the nodes and call content_update again", async () => {
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

    expect(result.content[0]?.text).toContain(
      "Fix these nodes and call content_update again.",
    );
  });

  test("invalid content on create tells the agent to call content_create again", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);

    const result = await callTool(h, secret, "content_create", {
      type: "post",
      slug: "bad",
      content: {
        version: "plumix.v2",
        blocks: [{ id: "x1", name: "made-up/block", attrs: {} }],
      },
    });

    expect(result._meta?.code).toBe("invalid_content");
    expect(result.content[0]?.text).toContain("content_create");
    expect(result.content[0]?.text).not.toContain("content_update");
  });

  test("a block the slot refuses lists that slot's allowed blocks", async () => {
    const h = await themedMcpHarness({});
    const secret = await mintPat(h);

    const result = await callTool(h, secret, "content_create", {
      type: "post",
      slug: "refused",
      content: {
        version: "plumix.v2",
        blocks: [
          {
            id: "c1",
            name: "site/card",
            attrs: { body: [{ id: "v1", name: "core/video", attrs: {} }] },
          },
        ],
      },
    });

    expect(result.content[0]?.text).toContain(
      'Slot "body" of "site/card" allows: core/rich-text.',
    );
  });

  test("a slot whose listed blocks the theme drops says it allows none", async () => {
    const h = await themedMcpHarness({ allowedBlocks: ["core/group"] });
    const secret = await mintPat(h);

    const result = await callTool(h, secret, "content_create", {
      type: "post",
      slug: "refused",
      content: {
        version: "plumix.v2",
        blocks: [
          {
            id: "c1",
            name: "site/card",
            attrs: { body: [{ id: "v1", name: "core/video", attrs: {} }] },
          },
        ],
      },
    });

    expect(result.content[0]?.text).toContain(
      'Slot "body" of "site/card" allows: none.',
    );
  });

  test("a block the theme does not allow lists the allowed top-level blocks", async () => {
    const h = await themedMcpHarness({ allowedBlocks: ["core/group"] });
    const secret = await mintPat(h);

    const result = await callTool(h, secret, "content_create", {
      type: "post",
      slug: "refused",
      content: {
        version: "plumix.v2",
        blocks: [{ id: "v1", name: "core/video", attrs: {} }],
      },
    });

    expect(result.content[0]?.text).toContain(
      "Allowed blocks: core/group, site/card.",
    );
  });

  test("a nested block the theme drops lists that slot's blocks, requires-parent children included", async () => {
    const h = await themedMcpHarness({
      blocks: [tabs, tab],
      allowedBlocks: ["core/group"],
    });
    const secret = await mintPat(h);

    const result = await callTool(h, secret, "content_create", {
      type: "post",
      slug: "refused",
      content: {
        version: "plumix.v2",
        blocks: [
          {
            id: "t1",
            name: "site/tabs",
            attrs: { items: [{ id: "v1", name: "core/video", attrs: {} }] },
          },
        ],
      },
    });

    expect(result.content[0]?.text).toContain(
      'Slot "items" of "site/tabs" allows: core/group, site/tabs, site/tab.',
    );
    expect(result.content[0]?.text).not.toContain("Allowed blocks:");
  });

  test("a requires-parent block at the top level lists the top-level blocks", async () => {
    const h = await themedMcpHarness({
      blocks: [tabs, tab],
      allowedBlocks: ["core/group"],
    });
    const secret = await mintPat(h);

    const result = await callTool(h, secret, "content_create", {
      type: "post",
      slug: "refused",
      content: {
        version: "plumix.v2",
        blocks: [{ id: "t1", name: "site/tab", attrs: {} }],
      },
    });

    expect(result.content[0]?.text).toContain(
      "Allowed blocks: core/group, site/tabs.",
    );
  });

  test("a block refused for a missing capability is not offered back", async () => {
    const h = await themedMcpHarness({ blocks: [gated] });
    const secret = await mintPat(h, { scopes: ["entry:post:create"] });

    const result = await callTool(h, secret, "content_create", {
      type: "post",
      slug: "refused",
      content: {
        version: "plumix.v2",
        blocks: [{ id: "g1", name: "site/gated", attrs: {} }],
      },
    });

    expect(result.content[0]?.text).toContain("needs the");
    expect(result.content[0]?.text).not.toMatch(
      /Allowed blocks:[^.]*site\/gated/,
    );
  });

  test("a forbidden style literal lists that property's tokens", async () => {
    const h = await themedMcpHarness({
      allowCustomStyles: false,
      tokens: { color: { primary: { value: "#06f" } } },
    });
    const secret = await mintPat(h);

    const result = await callTool(h, secret, "content_create", {
      type: "post",
      slug: "refused",
      content: {
        version: "plumix.v2",
        blocks: [
          {
            id: "g1",
            name: "core/group",
            attrs: {},
            style: { large: { color: "red" } },
          },
        ],
      },
    });

    expect(result.content[0]?.text).toContain(
      'Tokens for "color": var(--plumix-color-primary).',
    );
  });

  test("a forbidden literal in a category with no tokens says there are none", async () => {
    const h = await themedMcpHarness({ allowCustomStyles: false });
    const secret = await mintPat(h);

    const result = await callTool(h, secret, "content_create", {
      type: "post",
      slug: "refused",
      content: {
        version: "plumix.v2",
        blocks: [
          {
            id: "g1",
            name: "core/group",
            attrs: {},
            style: { large: { color: "red" } },
          },
        ],
      },
    });

    expect(result.content[0]?.text).toContain('Tokens for "color": none.');
  });

  test("a refusal lists what is allowed before telling the agent to retry", async () => {
    const h = await themedMcpHarness({ allowedBlocks: ["core/group"] });
    const secret = await mintPat(h);

    const result = await callTool(h, secret, "content_create", {
      type: "post",
      slug: "refused",
      content: {
        version: "plumix.v2",
        blocks: [{ id: "v1", name: "core/video", attrs: {} }],
      },
    });

    expect(result.content[0]?.text).toContain(
      "Allowed blocks: core/group, site/card. Fix these nodes and call content_create again.",
    );
  });

  test("an id of another entry type is not found", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id, etag } = await draftOf(h, secret);

    const result = await callTool(h, secret, "content_update", {
      type: "page",
      id,
      ifMatch: etag,
      title: "Wrong type",
    });

    expect(result._meta?.code).toBe("not_found");
    expect((await rowOf(h, id))?.title).toBe("Draft");
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

  test("a write leaves no lease held", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id, etag } = await draftOf(h, secret);

    await callTool(h, secret, "content_update", {
      type: "post",
      id,
      ifMatch: etag,
      title: "Leased",
    });

    expect(await readEditLease(h.db, { kind: "entry", id })).toBeUndefined();
  });

  test("a refused write leaves no lease held", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id, etag } = await draftOf(h, secret);

    await callTool(h, secret, "content_update", {
      type: "post",
      id,
      ifMatch: `${etag}-stale`,
      title: "Refused",
    });

    expect(await readEditLease(h.db, { kind: "entry", id })).toBeUndefined();
  });

  test("a write returns only id, etag and status", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id, etag } = await draftOf(h, secret);

    const updated = await callTool(h, secret, "content_update", {
      type: "post",
      id,
      ifMatch: etag,
      title: "Shape",
    });

    expect(Object.keys(parsed<Written>(updated)).sort()).toEqual([
      "etag",
      "id",
      "status",
    ]);
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

  test("both write tools are listed as neither read-only nor destructive", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);

    const { tools } = (await rpc(h, secret, "tools/list", {})) as {
      tools: { name: string; annotations?: Record<string, boolean> }[];
    };

    const hints = Object.fromEntries(
      tools
        .filter(
          (t) => t.name === "content_create" || t.name === "content_update",
        )
        .map((t) => [t.name, t.annotations]),
    );
    expect(hints).toEqual({
      content_create: { readOnlyHint: false, destructiveHint: false },
      content_update: { readOnlyHint: false, destructiveHint: false },
    });
  });
});

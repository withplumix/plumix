import { describe, expect, test } from "vitest";

import type { UserRole } from "../db/schema/users.js";
import type { DispatcherHarness } from "../test/dispatcher.js";
import { acquireEditLease, readEditLease } from "../db/edit-lease.js";
import { eq } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { terms } from "../db/schema/terms.js";
import { definePlugin } from "../plugin/define.js";
import { createDispatcherHarness } from "../test/dispatcher.js";

const blog = definePlugin("test-blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      isHierarchical: false,
      supports: ["title", "editor", "excerpt", "revisions"],
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
  const { secret } = await h.factory.apiToken.create({
    userId: id,
    scopes,
  });
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

async function draftOf(h: DispatcherHarness, secret: string, slug = "draft") {
  return parsed<Written>(
    await callTool(h, secret, "content_create", {
      type: "post",
      slug,
      title: "Draft",
    }),
  );
}

describe("MCP content_publish", () => {
  test("publishes a draft, which the admin then sees as published", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id, etag } = await draftOf(h, secret);

    const result = await callTool(h, secret, "content_publish", {
      type: "post",
      id,
      ifMatch: etag,
    });

    const written = parsed<Written>(result);
    expect(written.status).toBe("published");
    expect(written.etag).not.toBe(etag);
    expect((await rowOf(h, id))?.status).toBe("published");
  });

  test("a token without the publish capability is refused as forbidden", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h, {
      scopes: ["entry:post:read", "entry:post:create", "entry:post:edit_own"],
    });
    const { id, etag } = await draftOf(h, secret);

    const result = await callTool(h, secret, "content_publish", {
      type: "post",
      id,
      ifMatch: etag,
    });

    expect(result._meta?.code).toBe("forbidden");
    expect(result.content[0]?.text).toContain("entry:post:publish");
    expect((await rowOf(h, id))?.status).toBe("draft");
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

    const result = await callTool(h, secret, "content_publish", {
      type: "post",
      id,
      ifMatch: stale,
    });

    expect(result._meta?.code).toBe("conflict");
    expect(result.content[0]?.text).toContain(current);
    expect(result.content[0]?.text).toContain("content_publish");
    expect((await rowOf(h, id))?.status).toBe("draft");
  });

  test("a held lease returns locked, leaves the lease and publishes nothing", async () => {
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

    const result = await callTool(h, secret, "content_publish", {
      type: "post",
      id,
      ifMatch: etag,
    });

    expect(result._meta?.code).toBe("locked");
    expect(result.content[0]?.text).toContain("Ada Lovelace");
    expect((await rowOf(h, id))?.status).toBe("draft");
    expect((await readEditLease(h.db, { kind: "entry", id }))?.holder.id).toBe(
      holder.id,
    );
  });

  test("leaves no lease held", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id, etag } = await draftOf(h, secret);

    await callTool(h, secret, "content_publish", {
      type: "post",
      id,
      ifMatch: etag,
    });

    expect(await readEditLease(h.db, { kind: "entry", id })).toBeUndefined();
  });

  test("an id of another entry type is not found", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id, etag } = await draftOf(h, secret);

    const result = await callTool(h, secret, "content_publish", {
      type: "page",
      id,
      ifMatch: etag,
    });

    expect(result._meta?.code).toBe("not_found");
    expect((await rowOf(h, id))?.status).toBe("draft");
  });
});

describe("MCP content_trash and content_restore", () => {
  test("trash moves an entry to the trash and restore brings it back as a draft", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id } = await draftOf(h, secret);

    const trashed = parsed<Written>(
      await callTool(h, secret, "content_trash", { type: "post", id }),
    );
    expect(trashed.status).toBe("trash");
    expect((await rowOf(h, id))?.status).toBe("trash");

    const restored = parsed<Written>(
      await callTool(h, secret, "content_restore", { type: "post", id }),
    );
    expect(restored.status).toBe("draft");
    expect(Object.keys(restored).sort()).toEqual(["etag", "id", "status"]);
    expect((await rowOf(h, id))?.status).toBe("draft");
  });

  test("a token without the delete capability cannot trash", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h, {
      scopes: ["entry:post:read", "entry:post:create", "entry:post:edit_own"],
    });
    const { id } = await draftOf(h, secret);

    const result = await callTool(h, secret, "content_trash", {
      type: "post",
      id,
    });

    expect(result._meta?.code).toBe("forbidden");
    expect((await rowOf(h, id))?.status).toBe("draft");
  });

  test("restoring an entry that is not trashed is a conflict", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id } = await draftOf(h, secret);

    const result = await callTool(h, secret, "content_restore", {
      type: "post",
      id,
    });

    expect(result._meta?.code).toBe("conflict");
    expect(result.content[0]?.text).toContain("not_trashed");
  });

  test("an id of another entry type is not found", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id } = await draftOf(h, secret);

    const result = await callTool(h, secret, "content_trash", {
      type: "page",
      id,
    });

    expect(result._meta?.code).toBe("not_found");
    expect((await rowOf(h, id))?.status).toBe("draft");
  });
});

describe("MCP content_duplicate", () => {
  test("copies an entry into a new draft", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id } = await draftOf(h, secret);

    const copy = parsed<Written>(
      await callTool(h, secret, "content_duplicate", { type: "post", id }),
    );

    expect(copy.id).not.toBe(id);
    expect(copy.status).toBe("draft");
    expect(Object.keys(copy).sort()).toEqual(["etag", "id", "status"]);
    expect((await rowOf(h, copy.id))?.title).toBe("Draft (copy)");
  });

  test("content the site's rules refuse is invalid_content that says to report and stop", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id } = await draftOf(h, secret);
    await h.db
      .update(entries)
      .set({
        content: {
          version: "plumix.v2",
          blocks: [{ id: "col1", name: "core/column", attrs: { content: [] } }],
        },
      })
      .where(eq(entries.id, id));

    const result = await callTool(h, secret, "content_duplicate", {
      type: "post",
      id,
    });

    expect(result._meta?.code).toBe("invalid_content");
    expect(result.content[0]?.text).toContain("blocks[0]");
    expect(result.content[0]?.text).toContain(
      "Report this to the user and stop",
    );
    expect(result.content[0]?.text).not.toContain("Fix these nodes");
  });
});

describe("MCP content_discard_draft", () => {
  test("drops the caller's pending draft and leaves the live entry", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id, etag } = await draftOf(h, secret);

    const result = parsed<Written>(
      await callTool(h, secret, "content_discard_draft", { type: "post", id }),
    );

    expect(result).toEqual({ id, etag, status: "draft" });
  });

  test("an id of another entry type is not found", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id } = await draftOf(h, secret);

    const result = await callTool(h, secret, "content_discard_draft", {
      type: "page",
      id,
    });

    expect(result._meta?.code).toBe("not_found");
  });
});

describe("MCP tools/list hints", () => {
  test("only content_trash is destructive and none is read-only", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);

    const { tools } = (await rpc(h, secret, "tools/list", {})) as {
      tools: { name: string; annotations?: Record<string, boolean> }[];
    };

    const written = tools.filter((t) => t.annotations?.readOnlyHint === false);
    expect(
      written.filter((t) => t.annotations?.destructiveHint).map((t) => t.name),
    ).toEqual(["content_trash"]);
    expect(written.map((t) => t.name).sort()).toEqual(
      [
        "content_create",
        "content_discard_draft",
        "content_duplicate",
        "content_publish",
        "content_restore",
        "content_trash",
        "content_update",
        "revision_restore",
        "term_create",
        "term_update",
      ].sort(),
    );
  });
});

interface RevisionItem {
  readonly id: number;
  readonly title: string;
}

async function revisionsOf(h: DispatcherHarness, secret: string, id: number) {
  return parsed<{ revisions: RevisionItem[] }>(
    await callTool(h, secret, "revision_list", { type: "post", id }),
  ).revisions;
}

async function editedTwice(h: DispatcherHarness, secret: string) {
  const { id, etag } = await draftOf(h, secret);
  const first = parsed<Written>(
    await callTool(h, secret, "content_update", {
      type: "post",
      id,
      ifMatch: etag,
      title: "First",
    }),
  );
  const second = parsed<Written>(
    await callTool(h, secret, "content_update", {
      type: "post",
      id,
      ifMatch: first.etag,
      title: "Second",
    }),
  );
  return { id, etag: second.etag };
}

describe("MCP revision_list", () => {
  test("lists an entry's revisions, newest first", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id } = await editedTwice(h, secret);

    const revisions = await revisionsOf(h, secret, id);

    expect(revisions.map((r) => r.title)).toEqual(["Second", "First"]);
  });

  test("a token without read_revisions is refused as forbidden", async () => {
    const h = await mcpHarness();
    const author = await h.factory.user.create({ role: "editor" });
    const full = await mintPat(h, { userId: author.id });
    const { id } = await draftOf(h, full);
    const secret = await mintPat(h, {
      userId: author.id,
      scopes: ["entry:post:read", "entry:post:edit_own"],
    });

    const result = await callTool(h, secret, "revision_list", {
      type: "post",
      id,
    });

    expect(result._meta?.code).toBe("forbidden");
  });
});

describe("MCP revision_restore", () => {
  test("restores a revision onto the entry", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id, etag } = await editedTwice(h, secret);
    const first = (await revisionsOf(h, secret, id)).find(
      (r) => r.title === "First",
    );

    const restored = parsed<Written>(
      await callTool(h, secret, "revision_restore", {
        revisionId: first?.id,
        ifMatch: etag,
      }),
    );

    expect(Object.keys(restored).sort()).toEqual(["etag", "id", "status"]);
    expect(restored.id).toBe(id);
    expect((await rowOf(h, id))?.title).toBe("First");
    expect(await readEditLease(h.db, { kind: "entry", id })).toBeUndefined();
  });

  test("a stale ifMatch returns conflict and restores nothing", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id, etag } = await editedTwice(h, secret);
    const first = (await revisionsOf(h, secret, id)).find(
      (r) => r.title === "First",
    );
    await callTool(h, secret, "content_update", {
      type: "post",
      id,
      ifMatch: etag,
      title: "Third",
    });

    const result = await callTool(h, secret, "revision_restore", {
      revisionId: first?.id,
      ifMatch: etag,
    });

    expect(result._meta?.code).toBe("conflict");
    expect(result.content[0]?.text).toContain("revision_restore");
    expect((await rowOf(h, id))?.title).toBe("Third");
  });

  test("a held lease returns locked and leaves it", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id, etag } = await editedTwice(h, secret);
    const first = (await revisionsOf(h, secret, id)).find(
      (r) => r.title === "First",
    );
    const holder = await h.factory.user.create({ role: "editor" });
    await acquireEditLease(
      h.db,
      { kind: "entry", id },
      { userId: holder.id, surface: "admin" },
    );

    const result = await callTool(h, secret, "revision_restore", {
      revisionId: first?.id,
      ifMatch: etag,
    });

    expect(result._meta?.code).toBe("locked");
    expect((await rowOf(h, id))?.title).toBe("Second");
    expect((await readEditLease(h.db, { kind: "entry", id }))?.holder.id).toBe(
      holder.id,
    );
  });

  test("a token without restore_revision is refused as forbidden", async () => {
    const h = await mcpHarness();
    const full = await mintPat(h);
    const { id, etag } = await editedTwice(h, full);
    const first = (await revisionsOf(h, full, id)).find(
      (r) => r.title === "First",
    );
    const secret = await mintPat(h, {
      scopes: [
        "entry:post:read",
        "entry:post:read_revisions",
        "entry:post:edit_any",
      ],
    });

    const result = await callTool(h, secret, "revision_restore", {
      revisionId: first?.id,
      ifMatch: etag,
    });

    expect(result._meta?.code).toBe("forbidden");
    expect(result.content[0]?.text).toContain("entry:post:restore_revision");
  });

  test("a revision the site's rules refuse returns invalid_content with the path and says to report and stop", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id, etag } = await editedTwice(h, secret);
    const first = (await revisionsOf(h, secret, id)).find(
      (r) => r.title === "First",
    );
    await h.db
      .update(entries)
      .set({
        content: {
          version: "plumix.v2",
          blocks: [{ id: "col1", name: "core/column", attrs: { content: [] } }],
        },
      })
      .where(eq(entries.id, first?.id ?? 0));

    const result = await callTool(h, secret, "revision_restore", {
      revisionId: first?.id,
      ifMatch: etag,
    });

    expect(result._meta?.code).toBe("invalid_content");
    expect(result.content[0]?.text).toContain("blocks[0]");
    expect(result.content[0]?.text).toContain(
      "Report this to the user and stop",
    );
    expect(result.content[0]?.text).not.toContain("Fix these nodes");
    expect((await rowOf(h, id))?.title).toBe("Second");
  });

  test("an unknown revision is not found", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);

    const result = await callTool(h, secret, "revision_restore", {
      revisionId: 999_999,
      ifMatch: "1",
    });

    expect(result._meta?.code).toBe("not_found");
    expect(result.content[0]?.text).toContain("revision_list");
  });
});

interface TermWritten {
  readonly id: number;
  readonly etag: string;
}

async function termRow(h: DispatcherHarness, id: number) {
  const [row] = await h.db.select().from(terms).where(eq(terms.id, id));
  return row;
}

async function termOf(h: DispatcherHarness, secret: string, slug = "news") {
  return parsed<TermWritten>(
    await callTool(h, secret, "term_create", {
      taxonomy: "category",
      name: "News",
      slug,
    }),
  );
}

describe("MCP term_create and term_update", () => {
  test("term_create makes a term and returns only id and etag", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);

    const created = await termOf(h, secret);

    expect(Object.keys(created).sort()).toEqual(["etag", "id"]);
    expect((await termRow(h, created.id))?.name).toBe("News");
  });

  test("term_get returns the etag term_update accepts", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id, etag } = await termOf(h, secret);

    const got = parsed<{ etag: string }>(
      await callTool(h, secret, "term_get", { taxonomy: "category", id }),
    );

    expect(got.etag).toBe(etag);
  });

  test("term_update with the current etag edits only the fields it is sent", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id, etag } = await termOf(h, secret);

    const updated = parsed<TermWritten>(
      await callTool(h, secret, "term_update", {
        taxonomy: "category",
        id,
        ifMatch: etag,
        name: "Headlines",
      }),
    );

    expect(Object.keys(updated).sort()).toEqual(["etag", "id"]);
    expect(updated.etag).not.toBe(etag);
    const row = await termRow(h, id);
    expect(row?.name).toBe("Headlines");
    expect(row?.slug).toBe("news");
    expect(await readEditLease(h.db, { kind: "term", id })).toBeUndefined();
  });

  test("a term_update without ifMatch is refused", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id } = await termOf(h, secret);

    const result = await callTool(h, secret, "term_update", {
      taxonomy: "category",
      id,
      name: "No etag",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("bad_input");
    expect(result.content[0]?.text).toContain("ifMatch");
    expect((await termRow(h, id))?.name).toBe("News");
  });

  test("a stale ifMatch returns conflict with the current etag", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id, etag: stale } = await termOf(h, secret);
    const { etag: current } = parsed<TermWritten>(
      await callTool(h, secret, "term_update", {
        taxonomy: "category",
        id,
        ifMatch: stale,
        name: "Newer",
      }),
    );

    const result = await callTool(h, secret, "term_update", {
      taxonomy: "category",
      id,
      ifMatch: stale,
      name: "Stale",
    });

    expect(result._meta?.code).toBe("conflict");
    expect(result.content[0]?.text).toContain(current);
    expect(result.content[0]?.text).toContain("term_get");
    expect(result.content[0]?.text).toContain("term_update");
    expect((await termRow(h, id))?.name).toBe("Newer");
  });

  test("a held lease returns locked and leaves it", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id, etag } = await termOf(h, secret);
    const holder = await h.factory.user.create({
      role: "editor",
      name: "Ada Lovelace",
    });
    await acquireEditLease(
      h.db,
      { kind: "term", id },
      { userId: holder.id, surface: "admin" },
    );

    const result = await callTool(h, secret, "term_update", {
      taxonomy: "category",
      id,
      ifMatch: etag,
      name: "Blocked",
    });

    expect(result._meta?.code).toBe("locked");
    expect(result.content[0]?.text).toContain("Ada Lovelace");
    expect(result.content[0]?.text).toContain("this term");
    expect((await termRow(h, id))?.name).toBe("News");
    expect((await readEditLease(h.db, { kind: "term", id }))?.holder.id).toBe(
      holder.id,
    );
  });

  test("a taxonomy mismatch on update is not found", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    const { id, etag } = await termOf(h, secret);

    const result = await callTool(h, secret, "term_update", {
      taxonomy: "post_tag",
      id,
      ifMatch: etag,
      name: "Wrong",
    });

    expect(result._meta?.code).toBe("not_found");
    expect((await termRow(h, id))?.name).toBe("News");
  });

  test("an unknown taxonomy on create is not found", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);

    const result = await callTool(h, secret, "term_create", {
      taxonomy: "nope",
      name: "X",
      slug: "x",
    });

    expect(result._meta?.code).toBe("not_found");
    expect(result.content[0]?.text).toContain("taxonomy_list");
  });

  test("a token without the edit capability is refused as forbidden", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h, { scopes: ["term:category:read"] });

    const result = await callTool(h, secret, "term_create", {
      taxonomy: "category",
      name: "X",
      slug: "x",
    });

    expect(result._meta?.code).toBe("forbidden");
  });

  test("a taken slug is a conflict", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);
    await termOf(h, secret);

    const result = await callTool(h, secret, "term_create", {
      taxonomy: "category",
      name: "Again",
      slug: "news",
    });

    expect(result._meta?.code).toBe("conflict");
    expect(result.content[0]?.text).toContain("term_create");
  });
});

describe("MCP permanent delete", () => {
  test("no tool deletes an entry or a term for good", async () => {
    const h = await mcpHarness();
    const secret = await mintPat(h);

    const { tools } = (await rpc(h, secret, "tools/list", {})) as {
      tools: { name: string }[];
    };

    expect(tools.filter((t) => /delete|purge|permanent/.test(t.name))).toEqual(
      [],
    );
  });
});

import { describe, expect, test } from "vitest";

import type {
  CreateDispatcherHarnessOptions,
  DispatcherHarness,
} from "../test/dispatcher.js";
import { definePlugin } from "../plugin/define.js";
import { createDispatcherHarness } from "../test/dispatcher.js";

const blog = definePlugin("test-blog", (ctx) => {
  ctx.registerEntryType("post", {
    label: "Posts",
    isPublic: true,
    isHierarchical: false,
    supports: ["title", "editor", "excerpt"],
  });
});

// A custom public type plus a non-public one, to prove custom types light up
// automatically and non-public types stay hidden.
const catalog = definePlugin("test-catalog", (ctx) => {
  ctx.registerEntryType("book", {
    label: "Books",
    isPublic: true,
    isHierarchical: false,
    supports: ["title"],
  });
  ctx.registerEntryType("ledger", {
    label: "Ledgers",
    isPublic: false,
    isHierarchical: false,
    supports: ["title"],
  });
});

async function seedPublished(
  h: DispatcherHarness,
  count: number,
  type = "post",
): Promise<void> {
  const author = await h.factory.user.create({ role: "author" });
  for (let i = 0; i < count; i++) {
    await h.factory.entry.create({
      type,
      status: "published",
      authorId: author.id,
    });
  }
}

function restHarness(
  options: CreateDispatcherHarnessOptions = {},
): Promise<DispatcherHarness> {
  return createDispatcherHarness({
    api: { enabled: true },
    plugins: [blog],
    ...options,
  });
}

function apiGet(path: string): Request {
  return new Request(`https://cms.example${path}`);
}

function bearerGet(path: string, secret: string): Request {
  return new Request(`https://cms.example${path}`, {
    headers: { authorization: `Bearer ${secret}` },
  });
}

async function mintPat(
  h: DispatcherHarness,
  {
    role = "editor",
    scopes = null,
    expiresAt,
  }: {
    role?: "subscriber" | "editor" | "admin";
    scopes?: string[] | null;
    expiresAt?: Date;
  } = {},
): Promise<{ userId: number; secret: string }> {
  const user = await h.factory.user.create({ role });
  const { secret } = await h.factory.apiToken.create({
    userId: user.id,
    scopes,
    expiresAt: expiresAt ?? null,
  });
  return { userId: user.id, secret };
}

async function seedDraft(h: DispatcherHarness): Promise<number> {
  const author = await h.factory.user.create({ role: "author" });
  const entry = await h.factory.entry.create({
    type: "post",
    status: "draft",
    authorId: author.id,
  });
  return entry.id;
}

interface ListEnvelope {
  readonly data: readonly Record<string, unknown>[];
  readonly meta: Record<string, unknown>;
  readonly links: Record<string, unknown>;
}

describe("REST API — entries list", () => {
  test("GET /{type} returns a {data,meta,links} envelope of published entries", async () => {
    const h = await restHarness();
    const author = await h.factory.user.create({ role: "author" });
    await h.factory.entry.create({
      type: "post",
      status: "published",
      authorId: author.id,
      title: "Live",
    });
    await h.factory.entry.create({
      type: "post",
      status: "draft",
      authorId: author.id,
      title: "Hidden",
    });

    const res = await h.dispatch(apiGet("/_plumix/api/v1/posts"));

    expect(res.status).toBe(200);
    const body = (await res.json()) as ListEnvelope;
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.title).toBe("Live");
    expect(body.meta).toMatchObject({ page: 1, per_page: 20 });
    expect(body).toHaveProperty("links");
  });
});

describe("REST API — entries get", () => {
  test("GET /{type}/{id} returns one published entry", async () => {
    const h = await restHarness();
    const author = await h.factory.user.create({ role: "author" });
    const entry = await h.factory.entry.create({
      type: "post",
      status: "published",
      authorId: author.id,
      title: "Live",
    });

    const res = await h.dispatch(apiGet(`/_plumix/api/v1/posts/${entry.id}`));

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.id).toBe(entry.id);
    expect(body.title).toBe("Live");
    expect(body).not.toHaveProperty("data");
  });

  test("an unpublished entry is 404 (existence stays hidden, never 403)", async () => {
    const h = await restHarness();
    const author = await h.factory.user.create({ role: "author" });
    const draft = await h.factory.entry.create({
      type: "post",
      status: "draft",
      authorId: author.id,
    });

    const res = await h.dispatch(apiGet(`/_plumix/api/v1/posts/${draft.id}`));

    expect(res.status).toBe(404);
  });

  test("a missing id is 404", async () => {
    const h = await restHarness();

    const res = await h.dispatch(apiGet("/_plumix/api/v1/posts/999999"));

    expect(res.status).toBe(404);
  });

  test("an unknown collection is 404", async () => {
    const h = await restHarness();

    const res = await h.dispatch(apiGet("/_plumix/api/v1/widgets"));

    expect(res.status).toBe(404);
  });
});

describe("REST API — public projection (default-deny)", () => {
  test("author is a compact public object — no email or role", async () => {
    const h = await restHarness();
    const author = await h.factory.user.create({
      role: "admin",
      name: "Ada",
    });
    const entry = await h.factory.entry.create({
      type: "post",
      status: "published",
      authorId: author.id,
    });

    const res = await h.dispatch(apiGet(`/_plumix/api/v1/posts/${entry.id}`));

    const body = (await res.json()) as { author: Record<string, unknown> };
    expect(body.author).toEqual({
      id: author.id,
      name: "Ada",
      avatarUrl: author.avatarUrl,
    });
    expect(body.author).not.toHaveProperty("email");
    expect(body.author).not.toHaveProperty("role");
  });

  test("privileged entry columns are absent from the projection", async () => {
    const h = await restHarness();
    const author = await h.factory.user.create({ role: "author" });
    const entry = await h.factory.entry.create({
      type: "post",
      status: "published",
      authorId: author.id,
      sortOrder: 7,
    });

    const res = await h.dispatch(apiGet(`/_plumix/api/v1/posts/${entry.id}`));

    const body = (await res.json()) as Record<string, unknown>;
    // The allowlist omits raw authorId, sortOrder, parentId, and meta — adding
    // a column to the entries table cannot leak it through this surface.
    expect(body).not.toHaveProperty("authorId");
    expect(body).not.toHaveProperty("sortOrder");
    expect(body).not.toHaveProperty("parentId");
    expect(body).not.toHaveProperty("meta");
  });
});

describe("REST API — pagination", () => {
  test("page/per_page paginate and links.next/prev appear at the right boundaries", async () => {
    const h = await restHarness();
    await seedPublished(h, 3);

    const page1 = (await (
      await h.dispatch(apiGet("/_plumix/api/v1/posts?per_page=2&page=1"))
    ).json()) as ListEnvelope;
    expect(page1.data).toHaveLength(2);
    expect(page1.meta).toMatchObject({ page: 1, per_page: 2 });
    expect(page1.links.next).toBeDefined();
    expect(page1.links.prev).toBeUndefined();

    const page2 = (await (
      await h.dispatch(apiGet("/_plumix/api/v1/posts?per_page=2&page=2"))
    ).json()) as ListEnvelope;
    expect(page2.data).toHaveLength(1);
    expect(page2.links.prev).toBeDefined();
    expect(page2.links.next).toBeUndefined();
  });

  test("a full last page exactly at the boundary has no next link", async () => {
    const h = await restHarness();
    await seedPublished(h, 2);

    const body = (await (
      await h.dispatch(apiGet("/_plumix/api/v1/posts?per_page=2"))
    ).json()) as ListEnvelope;

    expect(body.data).toHaveLength(2);
    expect(body.links.next).toBeUndefined();
  });

  test("per_page is capped", async () => {
    const h = await restHarness();

    const body = (await (
      await h.dispatch(apiGet("/_plumix/api/v1/posts?per_page=9999"))
    ).json()) as ListEnvelope;

    expect(body.meta.per_page).toBe(100);
  });
});

describe("REST API — type exposure", () => {
  test("a custom public type is reachable automatically", async () => {
    const h = await restHarness({ plugins: [catalog] });
    await seedPublished(h, 1, "book");

    const res = await h.dispatch(apiGet("/_plumix/api/v1/books"));

    expect(res.status).toBe(200);
    const body = (await res.json()) as ListEnvelope;
    expect(body.data).toHaveLength(1);
  });

  test("a non-public type is not exposed (404)", async () => {
    const h = await restHarness({ plugins: [catalog] });
    await seedPublished(h, 1, "ledger");

    const res = await h.dispatch(apiGet("/_plumix/api/v1/ledgers"));

    expect(res.status).toBe(404);
  });
});

describe("REST API — OpenAPI spec", () => {
  test("GET /openapi.json returns an OpenAPI 3.1 doc with the entries resources", async () => {
    const h = await restHarness();

    const res = await h.dispatch(apiGet("/_plumix/api/v1/openapi.json"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const doc = (await res.json()) as {
      openapi: string;
      paths: Record<string, unknown>;
    };
    expect(doc.openapi).toMatch(/^3\.1/);
    expect(doc.paths).toHaveProperty("/{type}");
    expect(doc.paths).toHaveProperty("/{type}/{id}");
  });
});

describe("REST API — bearer PAT auth", () => {
  test("a valid PAT reads non-published content its user may see", async () => {
    const h = await restHarness();
    const draftId = await seedDraft(h);
    const { secret } = await mintPat(h, { role: "editor" });

    // Anonymous can't see the draft...
    const anon = await h.dispatch(apiGet(`/_plumix/api/v1/posts/${draftId}`));
    expect(anon.status).toBe(404);

    // ...but an editor's PAT can.
    const authed = await h.dispatch(
      bearerGet(`/_plumix/api/v1/posts/${draftId}`, secret),
    );
    expect(authed.status).toBe(200);
    const body = (await authed.json()) as Record<string, unknown>;
    expect(body.id).toBe(draftId);
    expect(body.status).toBe("draft");
  });

  test("a scoped token is gated by scope ∩ role", async () => {
    const h = await restHarness();
    const draftId = await seedDraft(h);
    // Editor role could see drafts, but the token's scopes exclude edit_any.
    const { secret } = await mintPat(h, {
      role: "editor",
      scopes: ["entry:post:read"],
    });

    const res = await h.dispatch(
      bearerGet(`/_plumix/api/v1/posts/${draftId}`, secret),
    );

    expect(res.status).toBe(404);
  });

  test("an expired token is rejected with 401", async () => {
    const h = await restHarness();
    const { secret } = await mintPat(h, {
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await h.dispatch(bearerGet("/_plumix/api/v1/posts", secret));

    expect(res.status).toBe(401);
  });

  test("a malformed bearer token is rejected with 401", async () => {
    const h = await restHarness();

    const res = await h.dispatch(
      bearerGet("/_plumix/api/v1/posts", "pl_pat_not-a-real-token"),
    );

    expect(res.status).toBe(401);
  });

  test("a PAT-authed response is non-cacheable", async () => {
    const h = await restHarness();
    const { secret } = await mintPat(h, { role: "editor" });

    const res = await h.dispatch(bearerGet("/_plumix/api/v1/posts", secret));

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
});

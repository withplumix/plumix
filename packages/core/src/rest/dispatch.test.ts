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
    termTaxonomies: ["category", "tag"],
  });
  ctx.registerTermTaxonomy("category", {
    label: "Categories",
    isHierarchical: true,
    entryTypes: ["post"],
  });
  ctx.registerTermTaxonomy("tag", {
    label: "Tags",
    isHierarchical: false,
    entryTypes: ["post"],
  });
  ctx.registerTermTaxonomy("secret_tax", {
    label: "Secret",
    isPublic: false,
    isHierarchical: false,
    entryTypes: ["post"],
  });
  ctx.registerEntryMetaBox("seo", {
    label: "SEO",
    entryTypes: ["post"],
    fields: [
      {
        key: "featured",
        label: "Featured",
        inputType: "checkbox",
        type: "boolean",
        showInApi: true,
      },
      {
        key: "internal_note",
        label: "Internal",
        inputType: "text",
        type: "string",
      },
    ],
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
    // The allowlist omits raw authorId, sortOrder, and parentId — adding a
    // column to the entries table cannot leak it through this surface. Meta is
    // present but default-deny (empty until a field opts in via showInApi).
    expect(body).not.toHaveProperty("authorId");
    expect(body).not.toHaveProperty("sortOrder");
    expect(body).not.toHaveProperty("parentId");
    expect(body.meta).toEqual({});
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
    expect(doc.paths).toHaveProperty("/{collection}");
    expect(doc.paths).toHaveProperty("/{collection}/{id}");
  });

  test("the spec documents term resources and the entry term-embed", async () => {
    const h = await restHarness();

    const res = await h.dispatch(apiGet("/_plumix/api/v1/openapi.json"));
    const doc = (await res.json()) as Record<string, unknown>;
    const json = JSON.stringify(doc);

    // The entry schema's grouped term-embed field is documented...
    expect(json).toContain('"terms"');
    // ...and the collection responses are a union of the entry and term shapes.
    expect(json).toMatch(/"(anyOf|oneOf)"/);
  });
});

describe("REST API — term resources", () => {
  test("GET /{taxonomy} returns a paginated envelope of terms", async () => {
    const h = await restHarness();
    await h.factory.term.create({
      taxonomy: "category",
      name: "News",
      slug: "news",
    });

    const res = await h.dispatch(apiGet("/_plumix/api/v1/categories"));

    expect(res.status).toBe(200);
    const body = (await res.json()) as ListEnvelope;
    expect(body.data).toHaveLength(1);
    const term = body.data[0] as { id: number; name: string; slug: string };
    expect(typeof term.id).toBe("number");
    expect(term).toMatchObject({ name: "News", slug: "news" });
    expect(body.meta).toMatchObject({ page: 1 });
  });

  test("a non-public taxonomy is not exposed (404)", async () => {
    const h = await restHarness();

    const res = await h.dispatch(apiGet("/_plumix/api/v1/secret_taxes"));

    expect(res.status).toBe(404);
  });

  test("GET /{taxonomy}/{id} returns one term", async () => {
    const h = await restHarness();
    const term = await h.factory.term.create({
      taxonomy: "category",
      name: "News",
      slug: "news",
    });

    const res = await h.dispatch(
      apiGet(`/_plumix/api/v1/categories/${term.id}`),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ id: term.id, name: "News", slug: "news" });
  });

  test("a term requested under the wrong taxonomy is 404", async () => {
    const h = await restHarness();
    const term = await h.factory.term.create({
      taxonomy: "category",
      name: "News",
      slug: "news",
    });

    // The term exists, but under `category` — requesting it under `tags`
    // (also public) must hide it rather than reveal a cross-taxonomy item.
    const res = await h.dispatch(apiGet(`/_plumix/api/v1/tags/${term.id}`));

    expect(res.status).toBe(404);
  });

  test("a missing term id is 404", async () => {
    const h = await restHarness();

    const res = await h.dispatch(apiGet("/_plumix/api/v1/categories/999999"));

    expect(res.status).toBe(404);
  });
});

describe("REST API — meta visibility (default-deny)", () => {
  async function seedWithMeta(
    h: DispatcherHarness,
    meta: Record<string, unknown>,
  ): Promise<number> {
    const author = await h.factory.user.create({ role: "author" });
    const entry = await h.factory.entry.create({
      type: "post",
      status: "published",
      authorId: author.id,
      meta,
    });
    return entry.id;
  }

  test("a whitelisted meta field appears; a non-whitelisted one does not", async () => {
    const h = await restHarness();
    const id = await seedWithMeta(h, {
      featured: true,
      internal_note: "secret",
    });

    const res = await h.dispatch(apiGet(`/_plumix/api/v1/posts/${id}`));

    const body = (await res.json()) as { meta: Record<string, unknown> };
    expect(body.meta).toEqual({ featured: true });
    expect(body.meta).not.toHaveProperty("internal_note");
  });

  test("an unregistered meta key is never exposed (default-deny)", async () => {
    const h = await restHarness();
    const id = await seedWithMeta(h, { rogue: "leak" });

    const res = await h.dispatch(apiGet(`/_plumix/api/v1/posts/${id}`));

    const body = (await res.json()) as { meta: Record<string, unknown> };
    expect(body.meta).toEqual({});
  });

  test("a PAT-authed read applies the same meta whitelist", async () => {
    const h = await restHarness();
    const id = await seedWithMeta(h, {
      featured: true,
      internal_note: "secret",
    });
    const { secret } = await mintPat(h, { role: "admin" });

    const res = await h.dispatch(
      bearerGet(`/_plumix/api/v1/posts/${id}`, secret),
    );

    const body = (await res.json()) as { meta: Record<string, unknown> };
    expect(body.meta).toEqual({ featured: true });
  });
});

describe("REST API — entry term embed", () => {
  test("an entry embeds its terms grouped by taxonomy", async () => {
    const h = await restHarness();
    const author = await h.factory.user.create({ role: "author" });
    const entry = await h.factory.entry.create({
      type: "post",
      status: "published",
      authorId: author.id,
    });
    const term = await h.factory.term.create({
      taxonomy: "category",
      name: "News",
      slug: "news",
    });
    await h.factory.entryTerm.create({ entryId: entry.id, termId: term.id });

    const res = await h.dispatch(apiGet(`/_plumix/api/v1/posts/${entry.id}`));

    const body = (await res.json()) as { terms: Record<string, unknown> };
    expect(body.terms).toEqual({
      category: [{ id: term.id, name: "News", slug: "news" }],
    });
  });

  test("the list embeds terms and excludes non-public taxonomies", async () => {
    const h = await restHarness();
    const author = await h.factory.user.create({ role: "author" });
    const entry = await h.factory.entry.create({
      type: "post",
      status: "published",
      authorId: author.id,
    });
    const cat = await h.factory.term.create({
      taxonomy: "category",
      name: "News",
      slug: "news",
    });
    const secret = await h.factory.term.create({
      taxonomy: "secret_tax",
      name: "Hush",
      slug: "hush",
    });
    await h.factory.entryTerm.create({ entryId: entry.id, termId: cat.id });
    await h.factory.entryTerm.create({ entryId: entry.id, termId: secret.id });

    const res = await h.dispatch(apiGet("/_plumix/api/v1/posts"));

    const body = (await res.json()) as {
      data: { terms: Record<string, unknown> }[];
    };
    expect(body.data[0]?.terms).toEqual({
      category: [{ id: cat.id, name: "News", slug: "news" }],
    });
  });
});

describe("REST API — entry term filter", () => {
  test("filters entries by a taxonomy query param", async () => {
    const h = await restHarness();
    const author = await h.factory.user.create({ role: "author" });
    const matched = await h.factory.entry.create({
      type: "post",
      status: "published",
      authorId: author.id,
      title: "Matched",
    });
    await h.factory.entry.create({
      type: "post",
      status: "published",
      authorId: author.id,
      title: "Other",
    });
    const news = await h.factory.term.create({
      taxonomy: "category",
      name: "News",
      slug: "news",
    });
    await h.factory.entryTerm.create({
      entryId: matched.id,
      termId: news.id,
    });

    const res = await h.dispatch(apiGet("/_plumix/api/v1/posts?category=news"));

    const body = (await res.json()) as { data: { title: string }[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.title).toBe("Matched");
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

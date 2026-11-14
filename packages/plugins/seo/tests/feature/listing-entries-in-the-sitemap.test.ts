import { etagOf, sql } from "plumix/db";
import { definePlugin } from "plumix/plugin";
import { entries } from "plumix/schema";
import { testSite } from "plumix/test";
import { describe, expect, test } from "vitest";

import { seo } from "../../src/index.js";

const blog = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.registerEntryType("page", {
      label: "Pages",
      isPublic: true,
      supports: ["revisions"],
    });
  },
});

const site = await testSite({ plugins: [blog, seo()] });

/** `plumix` exports no span type; this is the part of one a plan reads. */
interface Span {
  readonly name: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly children: readonly Span[];
}

interface Statement {
  readonly text: string;
  readonly params: readonly unknown[];
}

function statementsIn(spans: readonly Span[]): Statement[] {
  return spans.flatMap((span) => [
    ...(span.name.startsWith("db:")
      ? [
          {
            text: span.attributes["db.sql"] as string,
            params: (span.attributes["db.params"] ?? []) as unknown[],
          },
        ]
      : []),
    ...statementsIn(span.children),
  ]);
}

/** The statements the last request sent to `entries`. */
function entriesStatementsOfLastVisit(): Statement[] {
  const snapshot = site.telemetry.snapshots.at(-1);
  const spans = (snapshot?.spans ?? []) as unknown as readonly Span[];
  return statementsIn(spans).filter(({ text }) =>
    text.includes('from "entries"'),
  );
}

/** Planned with the params it was bound to, as the site's database plans it. */
async function planOf(statement: Statement | undefined): Promise<string> {
  if (statement === undefined) throw new Error("no entries statement to plan");
  const pieces = statement.text.split("?");
  const bound = sql.join(
    pieces.map((piece, i) =>
      i < statement.params.length
        ? sql`${sql.raw(piece)}${statement.params[i]}`
        : sql.raw(piece),
    ),
  );
  const plan = await site.context.db.all<{ detail: string }>(
    sql`EXPLAIN QUERY PLAN ${bound}`,
  );
  return plan.map((step) => step.detail).join("\n");
}

function sitemapLocs(index: string): string[] {
  return [
    ...index.matchAll(/<sitemap><loc>https:\/\/cms\.example([^<]*)/g),
  ].map(([, path]) => path ?? "");
}

function urlLocs(urlset: string): string[] {
  return [...urlset.matchAll(/<url><loc>([^<]*)<\/loc>/g)].map(
    ([, loc]) => loc ?? "",
  );
}

/** Every URL the index's sub-sitemaps list, in the order they list them. */
async function listedUrls(): Promise<string[]> {
  const index = (await site.visit("/sitemap.xml")).body;
  const urls: string[] = [];
  for (const path of sitemapLocs(index)) {
    urls.push(...urlLocs((await site.visit(path)).body));
  }
  return urls;
}

describe("an entry type's sub-sitemap", () => {
  test("reads its page through an index, sorting nothing and parsing no meta", async () => {
    await site.factory.published.create({ type: "post" });
    const [first] = sitemapLocs((await site.visit("/sitemap.xml")).body);

    (await site.visit(first ?? "")).assertOk();
    const [statement] = entriesStatementsOfLastVisit();

    const plan = await planOf(statement);
    expect(statement?.text).not.toContain("json_type");
    expect(statement?.text).toMatch(/order by "entries"\."id" limit \?$/);
    expect(plan).toContain(
      "USING INDEX entries_type_status_id_idx (type=? AND status=? AND id>?)",
    );
    expect(plan).not.toContain("USE TEMP B-TREE");
  });
});

describe("an entry's noindex answer", () => {
  test("marking an entry noindex takes it out of its sub-sitemap", async () => {
    const post = await site.factory.published.create({
      type: "post",
      slug: "hidden",
    });

    await site.actingAs("admin").rpc.entry.update({
      id: post.id,
      meta: { seo_noindex: true },
      ifMatch: etagOf(post.updatedAt),
    });

    expect(await listedUrls()).toEqual([]);
  });

  test("unmarking it puts it back", async () => {
    const post = await site.factory.published.create({
      type: "post",
      slug: "back",
    });
    const admin = site.actingAs("admin");
    const marked = await admin.rpc.entry.update({
      id: post.id,
      meta: { seo_noindex: true },
      ifMatch: etagOf(post.updatedAt),
    });

    await admin.rpc.entry.update({
      id: post.id,
      meta: { seo_noindex: false },
      ifMatch: marked.etag,
    });

    expect(await listedUrls()).toEqual(["https://cms.example/post/back"]);
  });

  test("clearing it puts the entry back", async () => {
    const post = await site.factory.published.create({
      type: "post",
      slug: "cleared",
    });
    const admin = site.actingAs("admin");
    const marked = await admin.rpc.entry.update({
      id: post.id,
      meta: { seo_noindex: true },
      ifMatch: etagOf(post.updatedAt),
    });

    await admin.rpc.entry.update({
      id: post.id,
      meta: { seo_noindex: null },
      ifMatch: marked.etag,
    });

    expect(await listedUrls()).toEqual(["https://cms.example/post/cleared"]);
  });

  test("saving another SEO field keeps a hidden entry hidden", async () => {
    const post = await site.factory.published.create({ type: "post" });
    const admin = site.actingAs("admin");
    const marked = await admin.rpc.entry.update({
      id: post.id,
      meta: { seo_noindex: true },
      ifMatch: etagOf(post.updatedAt),
    });

    await admin.rpc.entry.update({
      id: post.id,
      meta: { seo_title: "Renamed" },
      ifMatch: marked.etag,
    });

    expect(await listedUrls()).toEqual([]);
  });

  test("publishing an entry that never answered lists it", async () => {
    const draft = await site.factory.draft.create({
      type: "post",
      slug: "fresh",
    });

    await site.actingAs("admin").rpc.entry.update({
      id: draft.id,
      status: "published",
      ifMatch: etagOf(draft.updatedAt),
    });

    expect(await listedUrls()).toEqual(["https://cms.example/post/fresh"]);
  });

  test("restoring a revision from before it was marked puts the entry back", async () => {
    const page = await site.factory.published.create({
      type: "page",
      slug: "restored",
    });
    const admin = site.actingAs("admin");
    const unmarked = await admin.rpc.entry.update({
      id: page.id,
      title: "Before",
      ifMatch: etagOf(page.updatedAt),
    });
    const marked = await admin.rpc.entry.update({
      id: page.id,
      title: "After",
      meta: { seo_noindex: true },
      ifMatch: unmarked.etag,
    });
    const revisions = await admin.rpc.entry.revisions.list({
      entryId: page.id,
    });
    const before = revisions.revisions.find(
      (revision) => revision.title === "Before",
    );

    await admin.rpc.entry.revisions.restore({
      revisionId: before?.id ?? 0,
      ifMatch: marked.etag,
    });

    expect(await listedUrls()).toEqual(["https://cms.example/page/restored"]);
  });
});

describe("a copy of a noindexed entry", () => {
  test("stays out of its sub-sitemap once published", async () => {
    const post = await site.factory.published.create({ type: "post" });
    const admin = site.actingAs("admin");
    await admin.rpc.entry.update({
      id: post.id,
      meta: { seo_noindex: true },
      ifMatch: etagOf(post.updatedAt),
    });
    const copy = await admin.rpc.entry.duplicate({ id: post.id });

    await admin.rpc.entry.update({
      id: copy.id,
      status: "published",
      ifMatch: copy.etag,
    });

    expect(await listedUrls()).toEqual([]);
  });
});

describe("a trashed entry", () => {
  test("leaves its sub-sitemap", async () => {
    const post = await site.factory.published.create({ type: "post" });

    await site.actingAs("admin").rpc.entry.trash({ id: post.id });

    expect(await listedUrls()).toEqual([]);
  });
});

describe("an entry type with more entries than a page holds", () => {
  test("lists every entry exactly once across its sub-sitemaps", async () => {
    const author = await site.factory.author.create();
    const rows = Array.from({ length: 2001 }, (_, i) =>
      site.factory.published.build({
        type: "post",
        slug: `post-${String(i)}`,
        authorId: author.id,
      }),
    );
    for (let i = 0; i < rows.length; i += 100) {
      await site.context.db.insert(entries).values(rows.slice(i, i + 100));
    }

    const urls = await listedUrls();

    expect(urls).toHaveLength(2001);
    expect(new Set(urls).size).toBe(2001);
  });
});

describe("the sitemap index", () => {
  test("finds an entry type's page boundaries from its index alone, parsing no meta", async () => {
    await site.factory.published.create({ type: "post" });

    (await site.visit("/sitemap.xml")).assertOk();
    // One per public type: posts and pages.
    const [posts, pages] = entriesStatementsOfLastVisit();

    const plan = await planOf(posts);
    expect(posts?.text).not.toContain("json_type");
    expect(posts?.text).toMatch(/order by "ranked"\."id"$/);
    expect(plan).toContain(
      "SEARCH entries USING COVERING INDEX entries_type_status_id_idx (type=? AND status=?)",
    );
    expect(plan).not.toContain("SCAN entries");
    // The one sort is the outer order by, over a row per page, not the scope.
    expect(plan.match(/USE TEMP B-TREE.*/g)).toEqual([
      "USE TEMP B-TREE FOR ORDER BY",
    ]);
    expect(plan).toMatch(/\nSCAN ranked\nUSE TEMP B-TREE FOR ORDER BY$/);
    expect(pages?.text).toBe(posts?.text);
  });
});

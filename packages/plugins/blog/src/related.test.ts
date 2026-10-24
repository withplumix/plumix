import type { EntryTypeOptions } from "plumix";
import type { AppContext, AuthenticatedUser } from "plumix/plugin";
import {
  ACCESS_POLICY_META_KEY,
  anonymousPolicy,
  challenge,
  definePolicy,
  grant,
} from "plumix/auth";
import {
  createPluginRegistry,
  definePlugin,
  readEntryType,
} from "plumix/plugin";
import {
  createTestContext,
  createTestDb,
  createTracedContext,
  factoriesFor,
  toRegisteredEntryType,
} from "plumix/test";
import { describe, expect, test } from "vitest";

import { createRelatedPostsLoader, findRelatedEntries } from "./related.js";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

/** Hard, not soft: a soft challenge still lists the entry. */
const membersOnlyPolicy = definePolicy({
  segments: ["members"],
  resolve: (c) => (c.user ? grant("members") : challenge("subscribe")),
});

const policiedPost: EntryTypeOptions = {
  label: "Posts",
  isPublic: true,
  access: {
    default: anonymousPolicy,
    policies: [{ key: "members", label: "Members", policy: membersOnlyPolicy }],
  },
};

const publicPosts = definePlugin("posts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  },
});

/** A traced context whose `post` type every visitor may list. */
function tracedContext(plugin = publicPosts) {
  return createTracedContext({ config: { plugins: [plugin] } });
}

function ctxFor(
  db: TestDb,
  options: {
    readonly post?: EntryTypeOptions;
    readonly user?: AuthenticatedUser;
  } = {},
): AppContext {
  const plugins = createPluginRegistry();
  plugins.entryTypes.set(
    "post",
    toRegisteredEntryType(
      "post",
      options.post ?? { label: "Posts", isPublic: true },
      "test",
    ),
  );
  return createTestContext({ db, plugins, user: options.user });
}

describe("findRelatedEntries", () => {
  test("returns published posts sharing a term, newest first, current excluded", async () => {
    const db = await createTestDb();
    const f = factoriesFor(db);
    const author = await f.user.create({});
    const topic = await f.term.create({ taxonomy: "category" });
    const other = await f.term.create({ taxonomy: "category" });

    const make = async (
      title: string,
      status: "published" | "draft",
      publishedAt: Date | null,
      termId: number,
      type = "post",
    ) => {
      const entry = await f.entry.create({
        type,
        title,
        status,
        publishedAt,
        authorId: author.id,
      });
      await f.entryTerm.create({ entryId: entry.id, termId });
      return entry;
    };

    const current = await make(
      "Current",
      "published",
      new Date(3000),
      topic.id,
    );
    const newer = await make("Newer", "published", new Date(2000), topic.id);
    const older = await make("Older", "published", new Date(1000), topic.id);
    await make("Draft sibling", "draft", null, topic.id);
    await make("Different topic", "published", new Date(2500), other.id);
    // Shares the term but is a different type — must not surface as related.
    await make("Page sibling", "published", new Date(2200), topic.id, "page");

    const related = await findRelatedEntries(ctxFor(db), current.id, 3);

    expect(related.map((e) => e.title)).toEqual(["Newer", "Older"]);
    expect(related.map((e) => e.id)).toEqual([newer.id, older.id]);
  });

  test("returns nothing when the entry's type is not public", async () => {
    const db = await createTestDb();
    const f = factoriesFor(db);
    const author = await f.user.create({});
    const topic = await f.term.create({ taxonomy: "category" });
    const current = await f.entry.create({
      type: "post",
      status: "published",
      publishedAt: new Date(2000),
      authorId: author.id,
    });
    const sibling = await f.entry.create({
      type: "post",
      status: "published",
      publishedAt: new Date(1000),
      authorId: author.id,
    });
    await f.entryTerm.create({ entryId: current.id, termId: topic.id });
    await f.entryTerm.create({ entryId: sibling.id, termId: topic.id });

    const related = await findRelatedEntries(
      ctxFor(db, { post: { label: "Posts", isPublic: false } }),
      current.id,
      3,
    );

    expect(related).toEqual([]);
  });

  test("returns nothing when the entry has no terms", async () => {
    const db = await createTestDb();
    const f = factoriesFor(db);
    const author = await f.user.create({});
    const entry = await f.entry.create({
      type: "post",
      status: "published",
      publishedAt: new Date(),
      authorId: author.id,
    });

    expect(await findRelatedEntries(ctxFor(db), entry.id, 3)).toEqual([]);
  });

  test("shares the current entry's type read with earlier consumers in the request", async () => {
    const { harness, ctx, run, dbQueryCount } = await tracedContext();
    const f = harness.factory;
    const author = await f.user.create({});
    const topic = await f.term.create({ taxonomy: "category" });
    const current = await f.entry.create({
      type: "post",
      status: "published",
      publishedAt: new Date(2000),
      authorId: author.id,
    });
    const sibling = await f.entry.create({
      type: "post",
      status: "published",
      publishedAt: new Date(1000),
      authorId: author.id,
    });
    await f.entryTerm.create({ entryId: current.id, termId: topic.id });
    await f.entryTerm.create({ entryId: sibling.id, termId: topic.id });

    const related = await run(async () => {
      // e.g. the comments plugin's enablement gate, earlier in the render.
      await readEntryType(ctx, current.id);
      const before = dbQueryCount();
      const rows = await findRelatedEntries(ctx, current.id, 3);
      // Only the list itself — terms and siblings are subqueries, and the
      // type read replays from the request memo instead of re-querying.
      expect(dbQueryCount() - before).toBe(1);
      return rows;
    });

    expect(related.map((e) => e.id)).toEqual([sibling.id]);
  });

  test("binds no statement past D1's 100-parameter cap however many siblings share a term", async () => {
    // libsql enforces no cap, so the statements' bound params are the only
    // place the ceiling is visible under test.
    const D1_BOUND_PARAMETER_CAP = 100;
    const { harness, ctx, run, dbSpans } = await tracedContext();
    const f = harness.factory;
    const author = await f.user.create({});
    const topic = await f.term.create({ taxonomy: "category" });
    const current = await f.entry.create({
      type: "post",
      status: "published",
      publishedAt: new Date(10_000),
      authorId: author.id,
    });
    const siblings = await f.entry.createList(D1_BOUND_PARAMETER_CAP + 50, {
      type: "post",
      status: "published",
      publishedAt: new Date(1000),
      authorId: author.id,
    });
    await Promise.all(
      [current, ...siblings].map((entry) =>
        f.entryTerm.create({ entryId: entry.id, termId: topic.id }),
      ),
    );

    const related = await run(() => findRelatedEntries(ctx, current.id, 3));

    expect(related).toHaveLength(3);
    expect(dbSpans()).not.toHaveLength(0);
    const boundCounts = dbSpans().map((span) => {
      const params = span.attributes["db.params"];
      return Array.isArray(params) ? params.length : 0;
    });
    expect(Math.max(...boundCounts)).toBeLessThanOrEqual(
      D1_BOUND_PARAMETER_CAP,
    );
  });
});

describe("findRelatedEntries under an entry's access policy", () => {
  async function seedMembersSibling(db: TestDb) {
    const f = factoriesFor(db);
    const author = await f.user.create({});
    const topic = await f.term.create({ taxonomy: "category" });
    const make = async (title: string, publishedAt: Date, meta = {}) => {
      const entry = await f.entry.create({
        type: "post",
        title,
        status: "published",
        publishedAt,
        authorId: author.id,
        meta,
      });
      await f.entryTerm.create({ entryId: entry.id, termId: topic.id });
      return entry;
    };
    const current = await make("Current", new Date(3000));
    await make("Public sibling", new Date(2000));
    await make("Members sibling", new Date(1000), {
      [ACCESS_POLICY_META_KEY]: "members",
    });
    return current;
  }

  test("leaves out a sibling the anonymous reader's policy refuses", async () => {
    const db = await createTestDb();
    const current = await seedMembersSibling(db);

    const related = await findRelatedEntries(
      ctxFor(db, { post: policiedPost }),
      current.id,
      3,
    );

    expect(related.map((e) => e.title)).toEqual(["Public sibling"]);
  });

  test("lists a members sibling to a signed-in member without edit capability", async () => {
    const db = await createTestDb();
    const current = await seedMembersSibling(db);
    const member = await factoriesFor(db).subscriber.create({});

    const related = await findRelatedEntries(
      ctxFor(db, {
        post: policiedPost,
        user: {
          id: member.id,
          email: member.email,
          role: member.role,
          meta: {},
        },
      }),
      current.id,
      3,
    );

    expect(related.map((e) => e.title)).toEqual([
      "Public sibling",
      "Members sibling",
    ]);
  });
});

describe("the configurable limit", () => {
  test("caps the strip at the requested size", async () => {
    const db = await createTestDb();
    const f = factoriesFor(db);
    const author = await f.user.create({});
    const topic = await f.term.create({ taxonomy: "category" });

    const make = async (title: string, publishedAt: Date) => {
      const entry = await f.entry.create({
        type: "post",
        title,
        status: "published",
        publishedAt,
        authorId: author.id,
      });
      await f.entryTerm.create({ entryId: entry.id, termId: topic.id });
      return entry;
    };

    const current = await make("Current", new Date(5000));
    await make("A", new Date(4000));
    await make("B", new Date(3000));
    await make("C", new Date(2000));

    expect(await findRelatedEntries(ctxFor(db), current.id, 2)).toHaveLength(2);
    // The plugin's default when a site sets no limit.
    expect(await findRelatedEntries(ctxFor(db), current.id, 3)).toHaveLength(3);
  });
});

describe("createRelatedPostsLoader", () => {
  test("honours the limit the plugin threads in from its options", async () => {
    const { harness, ctx, run } = await tracedContext();
    const f = harness.factory;
    const author = await f.user.create({});
    const topic = await f.term.create({ taxonomy: "category" });

    const make = async (publishedAt: Date) => {
      const entry = await f.entry.create({
        type: "post",
        status: "published",
        publishedAt,
        authorId: author.id,
      });
      await f.entryTerm.create({ entryId: entry.id, termId: topic.id });
      return entry;
    };

    const current = await make(new Date(5000));
    await make(new Date(4000));
    await make(new Date(3000));
    await make(new Date(2000));
    ctx.resolvedEntity = { kind: "entry", id: current.id, preview: false };

    const capped = await run(() =>
      createRelatedPostsLoader(2)({ slugs: ["strip"] }, ctx),
    );
    expect(capped.strip).toHaveLength(2);

    // No `limit` in the options ⇒ the loader's own default of three.
    const defaulted = await run(() =>
      createRelatedPostsLoader(undefined)({ slugs: ["strip"] }, ctx),
    );
    expect(defaulted.strip).toHaveLength(3);
  });

  test("hands the strip its titles with shortcodes expanded", async () => {
    const { harness, ctx, run } = await tracedContext();
    const f = harness.factory;
    const author = await f.user.create({});
    const topic = await f.term.create({ taxonomy: "category" });
    const [current, sibling] = await Promise.all([
      f.entry.create({
        type: "post",
        status: "published",
        publishedAt: new Date(2000),
        authorId: author.id,
      }),
      f.entry.create({
        type: "post",
        title: "Best of [year]",
        status: "published",
        publishedAt: new Date(1000),
        authorId: author.id,
      }),
    ]);
    await f.entryTerm.create({ entryId: current.id, termId: topic.id });
    await f.entryTerm.create({ entryId: sibling.id, termId: topic.id });
    ctx.resolvedEntity = { kind: "entry", id: current.id, preview: false };
    const year = new Intl.DateTimeFormat("en", { year: "numeric" }).format(
      new Date(),
    );

    const related = await run(() =>
      createRelatedPostsLoader(undefined)({ slugs: ["strip"] }, ctx),
    );

    expect(related.strip?.map((entry) => entry.title)).toEqual([
      `Best of ${year}`,
    ]);
  });

  test("lists a soft-challenged sibling to an anonymous reader without its body", async () => {
    const teaserPosts = definePlugin("teaser-posts", {
      setup: (ctx) => {
        ctx.registerEntryType("post", {
          label: "Posts",
          isPublic: true,
          access: {
            default: anonymousPolicy,
            policies: [
              {
                key: "teaser",
                label: "Teaser",
                policy: definePolicy({
                  segments: ["members"],
                  resolve: (c) =>
                    c.user
                      ? grant("members")
                      : challenge("paywall", { soft: true }),
                }),
              },
            ],
          },
        });
      },
    });
    const { harness, ctx, run } = await tracedContext(teaserPosts);
    const f = harness.factory;
    const author = await f.user.create({});
    const topic = await f.term.create({ taxonomy: "category" });
    const [current, teaser] = await Promise.all([
      f.entry.create({
        type: "post",
        status: "published",
        publishedAt: new Date(2000),
        authorId: author.id,
      }),
      f.entry.create({
        type: "post",
        title: "Teaser",
        status: "published",
        publishedAt: new Date(1000),
        authorId: author.id,
        meta: { [ACCESS_POLICY_META_KEY]: "teaser" },
      }),
    ]);
    await f.entryTerm.create({ entryId: current.id, termId: topic.id });
    await f.entryTerm.create({ entryId: teaser.id, termId: topic.id });
    ctx.resolvedEntity = { kind: "entry", id: current.id, preview: false };

    const related = await run(() =>
      createRelatedPostsLoader(undefined)({ slugs: ["strip"] }, ctx),
    );

    expect(related.strip).toEqual([
      expect.objectContaining({
        title: "Teaser",
        contentGated: true,
        content: null,
      }),
    ]);
  });
});

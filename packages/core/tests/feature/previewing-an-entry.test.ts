import { createElement } from "react";
import { beforeEach, describe, expect, test } from "vitest";

import type { AppContext } from "../../src/context/app-context.js";
import { ACCESS_POLICY_META_KEY } from "../../src/access/contract/meta-key.js";
import {
  createPreviewToken,
  verifyPreviewToken,
} from "../../src/auth/preview-token.js";
import { eq } from "../../src/db/index.js";
import { entries } from "../../src/db/schema/entries.js";
import { render } from "../../src/events-and-filters/render.js";
import { definePlugin } from "../../src/plugin/define.js";
import { upsertAutosave } from "../../src/revisions/repository.js";
import {
  fallback,
  forEntryType,
  NAMED_TEMPLATE_META_KEY,
} from "../../src/route/render/template-builders.js";
import { testSite } from "../../src/test/site.js";
import { defineTheme } from "../../src/theme.js";

const blogPlugin = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
    });
  },
});

const hierarchicalPagesPlugin = definePlugin("pages", {
  setup: (ctx) => {
    ctx.registerEntryType("page", {
      label: "Pages",
      isPublic: true,
      isHierarchical: true,
    });
  },
});

const TIPTAP_BODY = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Body." }] }],
};

const DRAFT_BODY = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Draft body." }],
    },
  ],
};

const site = await testSite({
  plugins: [blogPlugin, hierarchicalPagesPlugin],
});

describe("previewing an entry", () => {
  test("a valid preview token reveals a draft at its URL", async () => {
    const author = await site.factory.admin.create();
    const draft = await site.factory.draft.create({
      type: "post",
      slug: "secret",
      title: "Secret Draft",
      content: TIPTAP_BODY,
      authorId: author.id,
    });
    const token = await createPreviewToken(site.context.db, {
      entryId: draft.id,
      userId: author.id,
    });

    const page = await site.visit(`/post/secret?preview=${token}`);

    page.assertOk().assertSee("<h1>Secret Draft</h1>");
  });

  test("a preview token overlays the author's autosave onto a published entry", async () => {
    const author = await site.factory.admin.create();
    const live = await site.factory.published.create({
      type: "post",
      slug: "hello",
      title: "Live Title",
      content: TIPTAP_BODY,
      authorId: author.id,
    });
    await upsertAutosave(site.context.db, {
      entry: live,
      authorId: author.id,
      patch: {
        title: "Live Title", // anchored to live, as the RPC always does
        content: DRAFT_BODY,
        excerpt: null,
        meta: {},
        metaDeletes: [],
      },
    });
    const token = await createPreviewToken(site.context.db, {
      entryId: live.id,
      userId: author.id,
    });

    // With the token, the preview overlays the pending draft's content while
    // the title (a live field) tracks the live row.
    const page = await site.visit(`/post/hello?preview=${token}`);

    page.assertSee("<h1>Live Title</h1>").assertSee("Draft body.");
  });

  test("the same URL without the token renders the published row unchanged", async () => {
    const author = await site.factory.admin.create();
    const live = await site.factory.published.create({
      type: "post",
      slug: "hello",
      title: "Live Title",
      content: TIPTAP_BODY,
      authorId: author.id,
    });
    await upsertAutosave(site.context.db, {
      entry: live,
      authorId: author.id,
      patch: {
        title: "Live Title",
        content: DRAFT_BODY,
        excerpt: null,
        meta: {},
        metaDeletes: [],
      },
    });

    const page = await site.visit("/post/hello");

    page.assertSee("<h1>Live Title</h1>").assertDontSee("Draft body.");
  });

  test("a preview overlay reads the title from the live row, not the frozen autosave", async () => {
    // Title is live-only, so the preview shows the fresh live title, not the
    // snapshot the earlier draft autosave froze.
    const author = await site.factory.admin.create();
    const live = await site.factory.published.create({
      type: "post",
      slug: "hello",
      title: "Original Title",
      content: TIPTAP_BODY,
      authorId: author.id,
    });
    await upsertAutosave(site.context.db, {
      entry: live,
      authorId: author.id,
      patch: {
        title: "Original Title", // anchored to live, as the RPC always does
        content: DRAFT_BODY,
        excerpt: null,
        meta: {},
        metaDeletes: [],
      },
    });
    // A `saveAs: "live"` title edit lands on the live row only.
    await site.context.db
      .update(entries)
      .set({ title: "Fresh Title" })
      .where(eq(entries.id, live.id));
    const token = await createPreviewToken(site.context.db, {
      entryId: live.id,
      userId: author.id,
    });

    const page = await site.visit(`/post/hello?preview=${token}`);

    // Fresh live title, still with the drafted content overlaid.
    page
      .assertSee("<h1>Fresh Title</h1>")
      .assertSee("Draft body.")
      .assertDontSee("Original Title");
  });

  test("a preview token for a different entry does not overlay an autosave", async () => {
    const author = await site.factory.admin.create();
    const live = await site.factory.published.create({
      type: "post",
      slug: "hello",
      title: "Live Title",
      content: TIPTAP_BODY,
      authorId: author.id,
    });
    const other = await site.factory.published.create({
      type: "post",
      slug: "other",
      title: "Other",
      authorId: author.id,
    });
    await upsertAutosave(site.context.db, {
      entry: live,
      authorId: author.id,
      patch: {
        title: "Draft Title",
        content: null,
        excerpt: null,
        meta: {},
        metaDeletes: [],
      },
    });
    // Token is scoped to `other`, so it can't unlock hello's autosave.
    const token = await createPreviewToken(site.context.db, {
      entryId: other.id,
      userId: author.id,
    });

    const page = await site.visit(`/post/hello?preview=${token}`);

    page.assertSee("<h1>Live Title</h1>").assertDontSee("Draft Title");
  });

  test("an invalid preview token still 404s the draft", async () => {
    await site.factory.draft.create({
      type: "post",
      slug: "secret",
      title: "Secret",
    });

    const page = await site.visit("/post/secret?preview=bogus-token");

    page.assertNotFound();
  });

  test("a preview token does not reveal a different draft's URL", async () => {
    const author = await site.factory.admin.create();
    const a = await site.factory.draft.create({
      type: "post",
      slug: "draft-a",
      title: "Draft A",
      authorId: author.id,
    });
    await site.factory.draft.create({
      type: "post",
      slug: "draft-b",
      title: "Draft B",
      authorId: author.id,
    });
    const tokenForA = await createPreviewToken(site.context.db, {
      entryId: a.id,
      userId: author.id,
    });

    // A's token on B's URL must not reveal B.
    const page = await site.visit(`/post/draft-b?preview=${tokenForA}`);

    page.assertNotFound();
  });

  test("a preview token never reveals a trashed entry", async () => {
    const author = await site.factory.admin.create();
    const gone = await site.factory.trashed.create({
      type: "post",
      slug: "binned",
      title: "Binned",
      authorId: author.id,
    });
    const token = await createPreviewToken(site.context.db, {
      entryId: gone.id,
      userId: author.id,
    });

    const page = await site.visit(`/post/binned?preview=${token}`);

    page.assertNotFound();
  });

  test("a nested draft page under a published parent 404s without a token", async () => {
    const parent = await site.factory.published.create({
      type: "page",
      slug: "docs",
      title: "Docs",
      parentId: null,
    });
    await site.factory.draft.create({
      type: "page",
      slug: "unreleased",
      title: "Unreleased Page",
      content: TIPTAP_BODY,
      parentId: parent.id,
    });

    const page = await site.visit("/page/docs/unreleased");

    page.assertNotFound();
  });

  test("a preview token reveals a nested draft page under a published parent", async () => {
    const author = await site.factory.admin.create();
    const parent = await site.factory.published.create({
      type: "page",
      slug: "docs",
      title: "Docs",
      authorId: author.id,
      parentId: null,
    });
    const child = await site.factory.draft.create({
      type: "page",
      slug: "unreleased",
      title: "Unreleased Page",
      content: TIPTAP_BODY,
      authorId: author.id,
      parentId: parent.id,
    });
    const token = await createPreviewToken(site.context.db, {
      entryId: child.id,
      userId: author.id,
    });

    const page = await site.visit(`/page/docs/unreleased?preview=${token}`);

    page.assertOk().assertSee("<h1>Unreleased Page</h1>");
  });
});

describe("a preview link", () => {
  test("is minted with a token for a draft the caller can edit", async () => {
    const draft = await site.factory.draft.create({ slug: "secret-draft" });

    const result = await site
      .actingAs("editor")
      .rpc.entry.createPreviewLink({ id: draft.id });

    expect(result.url).toBe(`/post/secret-draft?preview=${result.token}`);
    expect(await verifyPreviewToken(site.context.db, result.token)).toBe(
      draft.id,
    );
  });

  test("walks a nested page's ancestors into its url", async () => {
    const parent = await site.factory.published.create({
      type: "page",
      slug: "docs",
    });
    const child = await site.factory.draft.create({
      type: "page",
      slug: "unreleased",
      parentId: parent.id,
    });

    const result = await site
      .actingAs("editor")
      .rpc.entry.createPreviewLink({ id: child.id });

    expect(result.url).toBe(`/page/docs/unreleased?preview=${result.token}`);
  });

  // An author has neither edit_any nor authorship of another's draft.
  test("is not minted for a draft the caller can't read", async () => {
    const draft = await site.factory.draft.create({ slug: "not-mine" });

    const mint = site
      .actingAs("author")
      .rpc.entry.createPreviewLink({ id: draft.id });

    await expect(mint).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("is not minted for an entry that does not exist", async () => {
    const mint = site
      .actingAs("editor")
      .rpc.entry.createPreviewLink({ id: 9999 });

    await expect(mint).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

const metaTheme = defineTheme({
  templates: [
    fallback(({ data }) => {
      if (!("entry" in data)) return null;
      const choice = data.entry.meta[ACCESS_POLICY_META_KEY];
      return createElement(
        "h1",
        null,
        `access:${typeof choice === "string" ? choice : "none"}`,
      );
    }),
  ],
});

const accessSite = await testSite({
  plugins: [blogPlugin],
  config: { theme: metaTheme },
});

describe("a preview overlay's per-entry access choice", () => {
  test("a preview overlay reports the live per-entry access choice, not the draft's", async () => {
    // The gate resolves policy from the persisted row, so the template's bag
    // must agree; a draft's pick gates nothing.
    const author = await accessSite.factory.admin.create();
    const live = await accessSite.factory.published.create({
      type: "post",
      slug: "hello",
      title: "Live Title",
      content: TIPTAP_BODY,
      authorId: author.id,
      meta: { [ACCESS_POLICY_META_KEY]: "members" },
    });
    // The draft moved the pick to `public`. Unsaved, so it gates nothing yet.
    await upsertAutosave(accessSite.context.db, {
      entry: live,
      authorId: author.id,
      patch: {
        title: "Live Title",
        content: TIPTAP_BODY,
        excerpt: null,
        meta: { [ACCESS_POLICY_META_KEY]: "public" },
        metaDeletes: [],
      },
    });
    const token = await createPreviewToken(accessSite.context.db, {
      entryId: live.id,
      userId: author.id,
    });

    const page = await accessSite.visit(`/post/hello?preview=${token}`);

    page.assertSee("access:members");
  });
});

const reservedTheme = defineTheme({
  templates: [
    fallback(({ data }) => {
      if (!("entry" in data)) return null;
      const reserved = Object.keys(data.entry.meta).filter((key) =>
        key.startsWith("__plumix_"),
      );
      return createElement("h1", null, `reserved:${reserved.join(",")}`);
    }),
  ],
});

const reservedSite = await testSite({
  plugins: [blogPlugin],
  config: { theme: reservedTheme },
});

describe("a preview overlay's meta", () => {
  test("a preview overlay keeps the autosave's reserved keys out of the entry's meta", async () => {
    const author = await reservedSite.factory.admin.create();
    const live = await reservedSite.factory.published.create({
      type: "post",
      slug: "hello",
      title: "Live Title",
      content: TIPTAP_BODY,
      authorId: author.id,
    });
    // Every autosave carries its snapshot envelope under a reserved key.
    await upsertAutosave(reservedSite.context.db, {
      entry: live,
      authorId: author.id,
      patch: {
        title: "Live Title",
        content: TIPTAP_BODY,
        excerpt: null,
        meta: { drafted: true },
        metaDeletes: [],
      },
    });
    const token = await createPreviewToken(reservedSite.context.db, {
      entryId: live.id,
      userId: author.id,
    });

    const page = await reservedSite.visit(`/post/hello?preview=${token}`);

    page.assertSee("<h1>reserved:</h1>");
  });
});

/** Theme with a `named` template for posts, plus the default fallback. */
const landingTheme = defineTheme({
  templates: [
    forEntryType("post")
      .named("landing", "Landing")
      .template(() => createElement("h1", null, "LANDING PAGE")),
    fallback(({ data }) =>
      "entry" in data ? createElement("h1", null, data.entry.title) : null,
    ),
  ],
});

const landingSite = await testSite({
  plugins: [blogPlugin],
  config: { theme: landingTheme },
});

describe("a preview overlay's unsaved named-template choice", () => {
  async function postWithPendingLandingPick() {
    const author = await landingSite.factory.admin.create();
    const live = await landingSite.factory.published.create({
      type: "post",
      slug: "hello",
      title: "Live Title",
      content: TIPTAP_BODY,
      authorId: author.id,
    });
    // Autosave carries the pending template pick as reserved meta.
    await upsertAutosave(landingSite.context.db, {
      entry: live,
      authorId: author.id,
      patch: {
        title: "Live Title",
        content: TIPTAP_BODY,
        excerpt: null,
        meta: { [NAMED_TEMPLATE_META_KEY]: "landing" },
        metaDeletes: [],
      },
    });
    return { author, live };
  }

  test("a preview overlay honors an unsaved named-template choice", async () => {
    const { author, live } = await postWithPendingLandingPick();
    const token = await createPreviewToken(landingSite.context.db, {
      entryId: live.id,
      userId: author.id,
    });

    // Preview resolves to the picked template — the reserved key survives
    // the overlay strip.
    const page = await landingSite.visit(`/post/hello?preview=${token}`);

    page.assertSee("LANDING PAGE");
  });

  test("without the token the published row has no choice and renders the default template", async () => {
    await postWithPendingLandingPick();

    const page = await landingSite.visit("/post/hello");

    page.assertDontSee("LANDING PAGE").assertSee("Live Title");
  });
});

const seen: AppContext["resolvedEntity"][] = [];
const entityObserver = definePlugin("entity-observer", {
  setup: (ctx) => {
    ctx.filters.add(render.document, (manifest, _input, appCtx) => {
      seen.push(appCtx.resolvedEntity);
      return manifest;
    });
  },
});

const observed = await testSite({ plugins: [blogPlugin, entityObserver] });

describe("the resolved entity says whether the autosave was overlaid", () => {
  beforeEach(() => {
    seen.length = 0;
  });

  async function publishedPost() {
    const author = await observed.factory.admin.create();
    const live = await observed.factory.published.create({
      type: "post",
      slug: "hello",
      title: "Live Title",
      content: TIPTAP_BODY,
      authorId: author.id,
    });
    const token = await createPreviewToken(observed.context.db, {
      entryId: live.id,
      userId: author.id,
    });
    return { author, live, token };
  }

  test("an overlaid preview render is a preview", async () => {
    const { author, live, token } = await publishedPost();
    await upsertAutosave(observed.context.db, {
      entry: live,
      authorId: author.id,
      patch: {
        title: "Live Title",
        content: null,
        excerpt: "Drafted excerpt",
        meta: {},
        metaDeletes: [],
      },
    });

    await observed.visit(`/post/hello?preview=${token}`);

    expect(seen).toEqual([{ kind: "entry", id: live.id, preview: true }]);
  });

  test("a render without a token is not a preview", async () => {
    const { live } = await publishedPost();

    await observed.visit("/post/hello");

    expect(seen).toEqual([{ kind: "entry", id: live.id, preview: false }]);
  });

  test("a token with no autosave behind it is not a preview", async () => {
    const { live, token } = await publishedPost();

    await observed.visit(`/post/hello?preview=${token}`);

    expect(seen).toEqual([{ kind: "entry", id: live.id, preview: false }]);
  });
});

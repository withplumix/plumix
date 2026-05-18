import { describe, expect, test } from "vitest";

import { defineBlock, defineMark } from "@plumix/blocks";

import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { HookRegistry } from "../../../hooks/registry.js";
import { definePlugin } from "../../../plugin/define.js";
import { createPluginRegistry } from "../../../plugin/manifest.js";
import { installPlugins } from "../../../plugin/register.js";
import { createRpcHarness } from "../../../test/rpc.js";
import { registerCoreLookupAdapters } from "../lookup-adapters.js";

describe("entry.create", () => {
  test("contributor can create a draft", async () => {
    const h = await createRpcHarness({ authAs: "contributor" });
    const created = await h.client.entry.create({
      title: "Hello",
      slug: "hello",
    });
    expect(created.status).toBe("draft");
    expect(created.authorId).toBe(h.user.id);
    expect(created.publishedAt).toBeNull();
  });

  describe("with a fixture plugin contributing a block + mark", () => {
    const PLUGIN_CONTENT = {
      type: "doc",
      content: [
        {
          type: "acme/callout",
          content: [
            {
              type: "text",
              text: "warn",
              marks: [{ type: "acme/highlight-warning" }],
            },
          ],
        },
      ],
    };

    async function pluginHarness() {
      const plugin = definePlugin("acme", (ctx) => {
        ctx.registerBlock(
          defineBlock({
            name: "acme/callout",
            title: "Callout",
            schema: () =>
              Promise.resolve({
                name: "acme/callout",
                parseHTML: () => [],
                renderHTML: () => ["div", 0],
              } as never),
            component: () => Promise.resolve(() => null),
          }),
        );
        ctx.registerMark(
          defineMark({
            name: "acme/highlight-warning",
            title: "Warning highlight",
            schema: () =>
              Promise.resolve({
                name: "acme/highlight-warning",
                parseHTML: () => [],
                renderHTML: () => ["mark", 0],
              } as never),
            component: () => Promise.resolve(() => null),
          }),
        );
      });
      const { registry } = await installPlugins({
        hooks: new HookRegistry(),
        plugins: [plugin],
      });
      return createRpcHarness({ authAs: "contributor", plugins: registry });
    }

    test("entry.create accepts content carrying the plugin block + mark", async () => {
      const h = await pluginHarness();
      const created = await h.client.entry.create({
        title: "p",
        slug: "p",
        content: PLUGIN_CONTENT,
      });
      expect(created.status).toBe("draft");
    });

    test("entry.get round-trips the plugin block + mark content unchanged", async () => {
      const h = await pluginHarness();
      const created = await h.client.entry.create({
        title: "p",
        slug: "p",
        content: PLUGIN_CONTENT,
      });
      const fetched = await h.client.entry.get({ id: created.id });
      expect(fetched.content).toEqual(PLUGIN_CONTENT);
    });
  });

  test("INVALID_BLOCK_CONTENT when content carries an unknown block type", async () => {
    const h = await createRpcHarness({ authAs: "contributor" });
    const error = await h.client.entry
      .create({
        title: "t",
        slug: "t",
        content: {
          type: "doc",
          content: [
            {
              type: "core/paragraph",
              content: [{ type: "text", text: "ok" }],
            },
            { type: "made-up/block", content: [] },
          ],
        },
      })
      .catch((rejection: unknown) => rejection);
    expect(error).toMatchObject({
      code: "INVALID_BLOCK_CONTENT",
    });
    const issues = ((error as { data?: { issues?: unknown[] } }).data?.issues ??
      []) as { code?: string; nodeName?: string }[];
    expect(issues.map((i) => i.nodeName)).toContain("made-up/block");
    expect(issues.map((i) => i.code)).toContain("unknown_block_type");
  });

  test("forbidden for a subscriber (no post:create)", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    await expect(
      h.client.entry.create({ title: "t", slug: "s" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:create" },
    });
  });

  test("forbidden when contributor tries to publish directly", async () => {
    const h = await createRpcHarness({ authAs: "contributor" });
    await expect(
      h.client.entry.create({
        title: "now",
        slug: "now",
        status: "published",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:publish" },
    });
  });

  test("forbidden when contributor tries to schedule — same gate as publish", async () => {
    const h = await createRpcHarness({ authAs: "contributor" });
    await expect(
      h.client.entry.create({
        title: "later",
        slug: "later",
        status: "scheduled",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "entry:post:publish" },
    });
  });

  test("entry:before_save cannot overwrite authorId at create", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const other = await h.factory.admin.create({
      email: "other@example.test",
    });
    h.hooks.addFilter("entry:before_save", (post) => ({
      ...post,
      authorId: other.id,
    }));
    const created = await h.client.entry.create({
      title: "t",
      slug: "guarded",
    });
    expect(created.authorId).toBe(h.user.id);
  });

  test("author can publish directly and publishedAt is stamped", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const created = await h.client.entry.create({
      title: "go",
      slug: "go",
      status: "published",
    });
    expect(created.status).toBe("published");
    expect(created.publishedAt).toBeInstanceOf(Date);
  });

  test("slug collision within the same type returns CONFLICT", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    await h.client.entry.create({ title: "A", slug: "same" });
    await expect(
      h.client.entry.create({ title: "B", slug: "same" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "slug_taken" },
    });
  });

  test("rpc:entry.create:input filter can rewrite the input before persistence", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    h.hooks.addFilter("rpc:entry.create:input", (input) => ({
      ...input,
      title: `[pinned] ${input.title}`,
    }));

    const created = await h.client.entry.create({
      title: "orig",
      slug: "orig",
    });
    expect(created.title).toBe("[pinned] orig");
  });

  test("entry:before_save filter runs before the insert", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    h.hooks.addFilter("entry:before_save", (post) => ({
      ...post,
      excerpt: `[auto] ${post.title}`,
    }));

    const created = await h.client.entry.create({
      title: "t",
      slug: "t-slug",
    });
    expect(created.excerpt).toBe("[auto] t");
  });

  test("entry:published fires once when status is published, never on drafts", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const onPublish = h.spyAction("entry:published");

    await h.client.entry.create({ title: "d", slug: "d-1" });
    onPublish.assertNotCalled();

    await h.client.entry.create({
      title: "p",
      slug: "p-1",
      status: "published",
    });
    onPublish.assertCalledOnce();
  });

  test("concurrent creates with the same slug: exactly one wins, the other gets CONFLICT", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const results = await Promise.allSettled([
      h.client.entry.create({ title: "A", slug: "race" }),
      h.client.entry.create({ title: "B", slug: "race" }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const [failure] = rejected;
    expect(failure?.reason).toMatchObject({
      code: "CONFLICT",
      data: { reason: "slug_taken" },
    });
  });

  test("persists the row so a follow-up query returns it", async () => {
    const h = await createRpcHarness({ authAs: "author" });
    const created = await h.client.entry.create({
      title: "persist",
      slug: "persist",
    });
    const row = await h.db.query.entries.findFirst({
      where: eq(entries.id, created.id),
    });
    expect(row?.title).toBe("persist");
  });

  test("rejects a parentId the caller cannot see (undistinguished 404)", async () => {
    const h = await createRpcHarness({ authAs: "contributor" });
    // Another author's draft — contributor lacks post:edit_any, doesn't own it.
    const other = await h.factory.admin.create({ email: "a@example.test" });
    const [secret] = await h.db
      .insert(entries)
      .values({
        type: "post",
        title: "hidden",
        slug: "hidden",
        status: "draft",
        authorId: other.id,
      })
      .returning();
    if (!secret) throw new Error("seed");

    await expect(
      h.client.entry.create({
        title: "child",
        slug: "child",
        parentId: secret.id,
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "entry", id: secret.id },
    });
  });

  test("rejects a parentId of a different post type", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const [page] = await h.db
      .insert(entries)
      .values({
        type: "page",
        title: "p",
        slug: "p",
        status: "published",
        authorId: h.user.id,
        publishedAt: new Date(),
      })
      .returning();
    if (!page) throw new Error("seed");

    await expect(
      h.client.entry.create({
        // implicit type "post" — mismatched with the "page" parent
        title: "child",
        slug: "child2",
        parentId: page.id,
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "entry", id: page.id },
    });
  });

  test("accepts a parentId the caller can read (same type, readable)", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const parent = await h.client.entry.create({
      title: "parent",
      slug: "parent",
      status: "published",
    });
    const child = await h.client.entry.create({
      title: "child",
      slug: "child3",
      parentId: parent.id,
    });
    expect(child.parentId).toBe(parent.id);
  });

  test("meta: registered keys persist and come back on the create response", async () => {
    const plugins = createPluginRegistry();
    plugins.entryMetaBoxes.set("test-seo", {
      id: "test-seo",
      label: "SEO",
      entryTypes: ["post"],
      fields: [
        {
          key: "meta_title",
          label: "Meta title",
          type: "string",
          inputType: "text",
        },
        {
          key: "is_featured",
          label: "Featured",
          type: "boolean",
          inputType: "checkbox",
        },
      ],
      registeredBy: "test",
    });
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const created = await h.client.entry.create({
      title: "with-meta",
      slug: "with-meta",
      meta: { meta_title: "SEO title", is_featured: true },
    });
    expect(created.meta).toEqual({
      meta_title: "SEO title",
      is_featured: true,
    });
  });

  test("meta: unregistered key → CONFLICT with the offending key surfaced", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    await expect(
      h.client.entry.create({
        title: "bad-meta",
        slug: "bad-meta",
        meta: { mystery: "x" },
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_not_registered", key: "mystery" },
    });
  });

  test("meta: reference field rejects an upsert pointing at a missing user", async () => {
    // Smoke test for the validateEntryMetaReferences wiring in
    // create.ts — confirms the LookupAdapter pipeline runs before the
    // entity insert and surfaces missing references through the same
    // `meta_invalid_value` envelope as a sanitize rejection. The
    // term + user wrappers share the same machinery; covering entry
    // is enough for regression detection.
    const plugins = createPluginRegistry();
    registerCoreLookupAdapters(plugins);
    plugins.entryMetaBoxes.set("ownership", {
      id: "ownership",
      label: "Ownership",
      entryTypes: ["post"],
      fields: [
        {
          key: "owner",
          label: "Owner",
          type: "string",
          inputType: "user",
          referenceTarget: { kind: "user" },
        },
      ],
      registeredBy: "test",
    });
    const h = await createRpcHarness({ authAs: "admin", plugins });
    await expect(
      h.client.entry.create({
        title: "missing-ref",
        slug: "missing-ref",
        meta: { owner: "999999" },
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "meta_invalid_value", key: "owner" },
    });
  });

  test("meta: input schema caps the map at 200 keys (DoS guard)", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const oversized: Record<string, string> = {};
    for (let i = 0; i < 201; i++) oversized[`k${i}`] = "x";
    await expect(
      h.client.entry.create({
        title: "too-much",
        slug: "too-much",
        meta: oversized,
      }),
    ).rejects.toMatchObject({
      // oRPC's valibot adapter surfaces a `BAD_REQUEST` for schema failures,
      // so we match on the code, not a CONFLICT reason — the cap is a wire
      // validation check, not a sanitizer rejection.
      code: "BAD_REQUEST",
    });
  });
});

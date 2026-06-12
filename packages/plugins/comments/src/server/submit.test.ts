import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness } from "plumix/test";
import { describe, expect, test } from "vitest";

import type { CommentsConfig } from "../types.js";
import { comments as commentsTable } from "../db/schema.js";
import { comments } from "../index.js";
import { applyCommentsSchema } from "../test/db.js";

const testBlog = definePlugin("test_blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      rewrite: { slug: "posts" },
    });
  },
});

type Harness = Awaited<ReturnType<typeof createDispatcherHarness>>;

async function harnessWith(config: CommentsConfig): Promise<Harness> {
  const harness = await createDispatcherHarness({
    plugins: [testBlog, comments(config)],
  });
  await applyCommentsSchema(harness.db);
  return harness;
}

async function seedPost(harness: Harness, overrides = {}) {
  const user = await harness.factory.user.create({});
  return harness.factory.entry.create({
    type: "post",
    title: "Post",
    authorId: user.id,
    status: "published",
    ...overrides,
  });
}

function submit(
  harness: Harness,
  entryId: number,
  body: Record<string, unknown> = {},
) {
  return harness.fetch("/_plumix/comments/submit", {
    method: "POST",
    json: {
      entryId,
      name: "Ada",
      email: "ada@example.test",
      body: "hello world",
      ...body,
    },
  });
}

async function rows(harness: Harness) {
  return harness.db.select().from(commentsTable);
}

describe("POST /_plumix/comments/submit", () => {
  test("auto-approves under mode 'none' and persists the comment", async () => {
    const harness = await harnessWith({ entryTypes: ["post"], mode: "none" });
    const entry = await seedPost(harness);

    const res = await submit(harness, entry.id);

    res.assertStatus(200);
    expect(await res.json()).toEqual({ status: "approved" });
    const stored = await rows(harness);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.status).toBe("approved");
    expect(stored[0]?.bodyMd).toBe("hello world");
  });

  test("holds a new email as pending under 'first_time'", async () => {
    const harness = await harnessWith({
      entryTypes: ["post"],
      mode: "first_time",
    });
    const entry = await seedPost(harness);

    const res = await submit(harness, entry.id);

    expect(await res.json()).toEqual({ status: "pending" });
  });

  test("honeypot submissions fake success and are not stored", async () => {
    const harness = await harnessWith({ entryTypes: ["post"], mode: "none" });
    const entry = await seedPost(harness);

    const res = await submit(harness, entry.id, {
      website: "http://spam.example",
    });

    res.assertStatus(200);
    expect(await rows(harness)).toHaveLength(0);
  });

  test("rejects comments on a non-enabled entry type", async () => {
    const harness = await harnessWith({ mode: "none" }); // post not enabled
    const entry = await seedPost(harness);

    const res = await submit(harness, entry.id);

    res.assertStatus(403);
    expect(await rows(harness)).toHaveLength(0);
  });

  test("rejects a missing email when requireEmail is on", async () => {
    const harness = await harnessWith({ entryTypes: ["post"], mode: "none" });
    const entry = await seedPost(harness);

    const res = await submit(harness, entry.id, { email: "" });

    res.assertStatus(400);
  });

  test("rate-limits a flood from one source", async () => {
    const harness = await harnessWith({
      entryTypes: ["post"],
      mode: "none",
      rateLimit: { max: 2, windowMin: 10 },
    });
    const entry = await seedPost(harness);

    await submit(harness, entry.id);
    await submit(harness, entry.id);
    const third = await submit(harness, entry.id);

    third.assertStatus(429);
    expect(await rows(harness)).toHaveLength(2);
  });

  test("a comment:moderate filter can demote to spam", async () => {
    const harness = await harnessWith({ entryTypes: ["post"], mode: "none" });
    harness.spyFilter("comment:moderate").override(() => "spam");
    const entry = await seedPost(harness);

    const res = await submit(harness, entry.id);

    expect(await res.json()).toEqual({ status: "spam" });
  });

  test("fires comment:created with the stored row", async () => {
    const harness = await harnessWith({ entryTypes: ["post"], mode: "none" });
    const spy = harness.spyAction("comment:created");
    const entry = await seedPost(harness);

    await submit(harness, entry.id);

    spy.assertCalledOnce();
  });

  test("stores a salted ip hash, never the cleartext ip", async () => {
    const harness = await harnessWith({ entryTypes: ["post"], mode: "none" });
    const entry = await seedPost(harness);

    await harness.fetch("/_plumix/comments/submit", {
      method: "POST",
      headers: { "cf-connecting-ip": "203.0.113.7" },
      json: {
        entryId: entry.id,
        name: "Ada",
        email: "ada@example.test",
        body: "hi",
      },
    });

    const stored = await rows(harness);
    expect(stored[0]?.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored[0]?.ipHash).not.toContain("203.0.113.7");
  });
});

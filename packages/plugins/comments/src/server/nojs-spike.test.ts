// SPIKE (#2034) — not for merge. Pins what a plain HTML form post to the
// public submit route does today, and what each prototype changes.
import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness } from "plumix/test";
import { describe, expect, test } from "vitest";

import type { CommentsConfig } from "../types.js";
import { comments as commentsTable } from "../db/schema.js";
import { comments } from "../index.js";
import { applyCommentsSchema } from "../test/db.js";

const ORIGIN = "https://cms.example";

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

async function seedPost(harness: Harness) {
  const user = await harness.factory.user.create({});
  return harness.factory.entry.create({
    type: "post",
    title: "Post",
    authorId: user.id,
    status: "published",
  });
}

/** Exactly what a browser sends for `<form method="post" action="...">`. */
function formPost(
  harness: Harness,
  fields: Record<string, string>,
  extra: Record<string, string> = {},
) {
  return harness.fetch("/_plumix/comments/submit", {
    method: "POST",
    withCsrfHeader: false,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: ORIGIN,
      referer: `${ORIGIN}/posts/post`,
      accept: "text/html,application/xhtml+xml",
      ...extra,
    },
    body: new URLSearchParams(fields).toString(),
  });
}

describe("SPIKE: no-JS form post, today", () => {
  // Recorded green before `formPost: true` was added; skipped once it was.
  test.skip("the dispatcher rejects it before the handler ever runs", async () => {
    const harness = await harnessWith({ entryTypes: ["post"], mode: "none" });
    const entry = await seedPost(harness);

    const res = await formPost(harness, {
      entryId: String(entry.id),
      name: "Ada",
      email: "ada@example.test",
      body: "hello world",
    });

    res.assertStatus(403);
    expect(await res.json()).toEqual({
      error: "forbidden",
      reason: "csrf_header_missing",
    });
    expect(await harness.db.select().from(commentsTable)).toHaveLength(0);
  });
});

describe("SPIKE P1: formPost flag alone", () => {
  // Recorded green with the flag and no body parsing; skipped once parsing landed.
  test.skip("passes CSRF, then dies on the body parser", async () => {
    const harness = await harnessWith({ entryTypes: ["post"], mode: "none" });
    const entry = await seedPost(harness);

    const res = await formPost(harness, {
      entryId: String(entry.id),
      name: "Ada",
      email: "ada@example.test",
      body: "hello world",
    });

    res.assertStatus(400);
    expect(await res.json()).toEqual({ error: "invalid_json" });
  });
});

describe("SPIKE P2: post/redirect/get", () => {
  test("stores the comment and sends the browser back to the post", async () => {
    const harness = await harnessWith({ entryTypes: ["post"], mode: "none" });
    const entry = await seedPost(harness);

    const res = await formPost(harness, {
      entryId: String(entry.id),
      name: "Ada",
      email: "ada@example.test",
      body: "hello world",
    });

    res.assertStatus(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/posts/post`);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const stored = await harness.db.select().from(commentsTable);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.status).toBe("approved");
  });

  test("the hidden returnTo field beats the Referer", async () => {
    const harness = await harnessWith({ entryTypes: ["post"], mode: "none" });
    const entry = await seedPost(harness);

    const res = await formPost(harness, {
      entryId: String(entry.id),
      name: "Ada",
      email: "ada@example.test",
      body: "hello",
      returnTo: `${ORIGIN}/posts/post#comments`,
    });

    res.assertStatus(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/posts/post#comments`);
  });

  test("an off-origin returnTo cannot turn the endpoint into an open redirect", async () => {
    const harness = await harnessWith({ entryTypes: ["post"], mode: "none" });
    const entry = await seedPost(harness);

    const res = await formPost(harness, {
      entryId: String(entry.id),
      name: "Ada",
      email: "ada@example.test",
      body: "hello",
      returnTo: "https://evil.example/phish",
    });

    res.assertStatus(303);
    // Falls through to the Referer, which is this site's.
    expect(res.headers.get("location")).toBe(`${ORIGIN}/posts/post`);
  });

  test("a returnTo pointing at the endpoint cannot make a loop", async () => {
    const harness = await harnessWith({ entryTypes: ["post"], mode: "none" });
    const entry = await seedPost(harness);

    const res = await formPost(
      harness,
      {
        entryId: String(entry.id),
        name: "Ada",
        email: "ada@example.test",
        body: "hello",
        returnTo: `${ORIGIN}/_plumix/comments/submit`,
      },
      { referer: `${ORIGIN}/_plumix/comments/submit` },
    );

    res.assertStatus(303);
    expect(res.headers.get("location")).toBe("/");
  });

  // Recorded green under P2; P3 replaced the dead-end page with the form back.
  test.skip("a refusal is an HTML page, not JSON — but not the form back", async () => {
    const harness = await harnessWith({
      entryTypes: ["post"],
      mode: "none",
      rateLimit: { max: 1, windowMin: 10 },
    });
    const entry = await seedPost(harness);
    const fields = {
      entryId: String(entry.id),
      name: "Ada",
      email: "ada@example.test",
      body: "hello",
    };

    await formPost(harness, fields);
    const res = await formPost(harness, fields);

    res.assertStatus(429);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("Too many comments");
    // The cost of owning no markup: their words are not in the response.
    expect(body).not.toContain("hello");
  });

  test("a held comment redirects to a page that cannot say it was held", async () => {
    const harness = await harnessWith({ entryTypes: ["post"], mode: "all" });
    const entry = await seedPost(harness);

    const res = await formPost(harness, {
      entryId: String(entry.id),
      name: "Ada",
      email: "ada@example.test",
      body: "awaiting review",
    });

    res.assertStatus(303);
    const stored = await harness.db.select().from(commentsTable);
    expect(stored[0]?.status).toBe("pending");
    // The visitor lands back on the post. A pending comment is not in the
    // rendered thread, and the redirect carries no state the theme could
    // read — so the page looks exactly as it did before they wrote it.
    expect(res.headers.get("location")).toBe(`${ORIGIN}/posts/post`);
    expect(new URL(res.headers.get("location") ?? "").search).toBe("");
  });

  test("a cross-origin form post is still refused", async () => {
    const harness = await harnessWith({ entryTypes: ["post"], mode: "none" });
    const entry = await seedPost(harness);

    const res = await formPost(
      harness,
      { entryId: String(entry.id), name: "Ada", body: "x" },
      { origin: "https://evil.example", referer: "https://evil.example/" },
    );

    res.assertStatus(403);
    expect(await harness.db.select().from(commentsTable)).toHaveLength(0);
  });
});

describe("SPIKE: what the session swap costs comments", () => {
  test("the same signed-in author is trusted with JS and held without it", async () => {
    const harness = await harnessWith({ entryTypes: ["post"], mode: "all" });
    const entry = await seedPost(harness);
    const author = await harness.factory.user.create({});

    // JS path — the island sets the header, so the session survives.
    const enhanced = await harness.fetch("/_plumix/comments/submit", {
      method: "POST",
      as: author,
      json: {
        entryId: entry.id,
        name: "Ada",
        email: "ada@example.test",
        body: "with javascript",
      },
    });
    enhanced.assertStatus(200);
    expect(await enhanced.json()).toEqual({ status: "approved" });

    // No-JS path — same cookie on the wire, but `withoutAmbientSession`
    // hands the handler an authenticator that resolves nobody.
    const plain = await harness.fetch("/_plumix/comments/submit", {
      method: "POST",
      as: author,
      withCsrfHeader: false,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: ORIGIN,
        referer: `${ORIGIN}/posts/post`,
      },
      body: new URLSearchParams({
        entryId: String(entry.id),
        name: "Ada",
        email: "ada@example.test",
        body: "without javascript",
      }).toString(),
    });
    plain.assertStatus(303);

    const stored = await harness.db.select().from(commentsTable);
    const byBody = new Map(stored.map((row) => [row.bodyMd, row]));
    expect(byBody.get("with javascript")?.status).toBe("approved");
    // Held for review, and the account link is gone — the admin queue
    // cannot tell this one was written by a registered user.
    expect(byBody.get("without javascript")?.status).toBe("pending");
    expect(byBody.get("with javascript")?.authorUserId).toBe(author.id);
    expect(byBody.get("without javascript")?.authorUserId).toBeNull();
  });
});

describe("SPIKE P3: the plugin owns the form markup", () => {
  test("a refusal hands the form back with the visitor's words in it", async () => {
    const harness = await harnessWith({
      entryTypes: ["post"],
      mode: "none",
      rateLimit: { max: 1, windowMin: 10 },
    });
    const entry = await seedPost(harness);
    const fields = {
      entryId: String(entry.id),
      name: "Ada",
      email: "ada@example.test",
      body: "a comment worth not losing",
    };

    await formPost(harness, fields);
    const res = await formPost(harness, fields);

    res.assertStatus(429);
    const body = await res.text();
    expect(body).toContain("Too many comments");
    // The whole difference from P2: their words are still there, in a
    // form they can resubmit.
    expect(body).toContain("a comment worth not losing");
    expect(body).toContain('value="Ada"');
    expect(body).toContain(`value="${String(entry.id)}"`);
    // And the honeypot is never echoed back into the form.
    expect(body).toContain('name="website" value=""');
  });
});

describe("SPIKE: how far the session divergence actually reaches", () => {
  test("under the default mode it costs a signed-in author only their first comment", async () => {
    const harness = await harnessWith({
      entryTypes: ["post"],
      mode: "first_time",
    });
    const entry = await seedPost(harness);
    const author = await harness.factory.user.create({});

    const plain = (body: string) =>
      harness.fetch("/_plumix/comments/submit", {
        method: "POST",
        as: author,
        withCsrfHeader: false,
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: ORIGIN,
          referer: `${ORIGIN}/posts/post`,
        },
        body: new URLSearchParams({
          entryId: String(entry.id),
          name: "Ada",
          email: "ada@example.test",
          body,
        }).toString(),
      });

    await plain("first one");
    const stored = await harness.db.select().from(commentsTable);
    expect(stored[0]?.status).toBe("pending");

    // Approve it, the way a moderator would.
    await harness.db.update(commentsTable).set({ status: "approved" });

    await plain("second one");
    const after = await harness.db.select().from(commentsTable);
    // The prior-approved count carries the author from here on, session or
    // no session — so the divergence is a first-comment problem, not a
    // permanent one.
    expect(after.find((r) => r.bodyMd === "second one")?.status).toBe(
      "approved",
    );
  });
});

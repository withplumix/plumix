// SPIKE (#2034) — the DX claim under test: the markup the plugin renders
// is a form the plugin's endpoint accepts, with no JavaScript anywhere in
// between. Renders the component, harvests the fields exactly as a browser
// would, and posts them at the real dispatcher.
import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness } from "plumix/test";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { comments as commentsTable } from "../db/schema.js";
import { CommentForm } from "../form/comment-form.js";
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

/** What the browser serialises when the visitor hits "Post comment". */
function serialize(
  html: string,
  typed: Readonly<Record<string, string>>,
): URLSearchParams {
  const root = document.createElement("div");
  root.innerHTML = html;
  const form = root.querySelector("form");
  if (!form) throw new Error("no form rendered");
  const body = new URLSearchParams();
  for (const control of form.querySelectorAll("input, textarea")) {
    const name = control.getAttribute("name");
    if (name === null) continue;
    body.set(name, typed[name] ?? control.getAttribute("value") ?? "");
  }
  return body;
}

describe("SPIKE: theme drops in the component, visitor has no JavaScript", () => {
  test("the rendered form round-trips into a stored comment", async () => {
    const harness = await createDispatcherHarness({
      plugins: [testBlog, comments({ entryTypes: ["post"], mode: "none" })],
    });
    await applyCommentsSchema(harness.db);
    const user = await harness.factory.user.create({});
    const entry = await harness.factory.entry.create({
      type: "post",
      title: "Post",
      authorId: user.id,
      status: "published",
    });

    const html = renderToStaticMarkup(
      <CommentForm
        action="/_plumix/comments/submit"
        entryId={entry.id}
        returnTo={`${ORIGIN}/posts/post`}
      />,
    );
    const body = serialize(html, {
      name: "Ada",
      email: "ada@example.test",
      body: "posted without a line of javascript",
    });
    // The honeypot is in the markup and a real browser posts it empty.
    expect(body.get("website")).toBe("");
    expect(body.get("entryId")).toBe(String(entry.id));

    const res = await harness.fetch("/_plumix/comments/submit", {
      method: "POST",
      withCsrfHeader: false,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: ORIGIN,
        referer: `${ORIGIN}/posts/post`,
      },
      body: body.toString(),
    });

    res.assertStatus(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/posts/post`);
    const stored = await harness.db.select().from(commentsTable);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.bodyMd).toBe("posted without a line of javascript");
    expect(stored[0]?.status).toBe("approved");
  });

  test("a bot filling the honeypot is answered identically and stores nothing", async () => {
    const harness = await createDispatcherHarness({
      plugins: [testBlog, comments({ entryTypes: ["post"], mode: "none" })],
    });
    await applyCommentsSchema(harness.db);
    const user = await harness.factory.user.create({});
    const entry = await harness.factory.entry.create({
      type: "post",
      title: "Post",
      authorId: user.id,
      status: "published",
    });

    const html = renderToStaticMarkup(
      <CommentForm action="/_plumix/comments/submit" entryId={entry.id} />,
    );
    const body = serialize(html, {
      name: "Bot",
      email: "bot@example.test",
      body: "buy things",
      website: "https://spam.example",
    });

    const res = await harness.fetch("/_plumix/comments/submit", {
      method: "POST",
      withCsrfHeader: false,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: ORIGIN,
        referer: `${ORIGIN}/posts/post`,
      },
      body: body.toString(),
    });

    res.assertStatus(303);
    expect(await harness.db.select().from(commentsTable)).toHaveLength(0);
  });
});

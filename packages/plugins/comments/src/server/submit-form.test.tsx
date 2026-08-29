import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { comments as commentsTable } from "../db/schema.js";
import { CommentMarkup } from "../form/comment-markup.js";
import {
  formPost,
  harnessWith,
  ORIGIN,
  rows,
  seedPost,
} from "../test/harness.js";

/**
 * What a browser serialises when the visitor presses the submit button:
 * every named control in the rendered markup, carrying either what they
 * typed or the value the server put there.
 */
function serializeForm(
  html: string,
  typed: Readonly<Record<string, string>> = {},
): URLSearchParams {
  const root = document.createElement("div");
  root.innerHTML = html;
  const form = root.querySelector("form");
  expect(form).not.toBeNull();
  const body = new URLSearchParams();
  for (const control of form?.querySelectorAll("input, textarea") ?? []) {
    const name = control.getAttribute("name");
    if (name === null) continue;
    // A `<textarea>` carries its default as its content rather than as a
    // `value` attribute, which is the one place the two controls differ.
    const rendered =
      control.tagName === "TEXTAREA"
        ? control.textContent
        : control.getAttribute("value");
    body.set(name, typed[name] ?? rendered ?? "");
  }
  return body;
}

const ENABLED = { entryTypes: ["post"], mode: "none" } as const;

const filled = (entryId: number, over: Record<string, string> = {}) => ({
  entryId: String(entryId),
  name: "Ada",
  email: "ada@example.test",
  body: "hello world",
  ...over,
});

describe("a plain form post, with no JavaScript in between", () => {
  test("stores the comment and sends the browser back to the post", async () => {
    const harness = await harnessWith(ENABLED);
    const entry = await seedPost(harness);

    const res = await formPost(harness, filled(entry.id));

    res.assertStatus(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/posts/post`);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const stored = await rows(harness);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.status).toBe("approved");
    expect(stored[0]?.bodyMd).toBe("hello world");
  });

  test("the markup the plugin renders round-trips into a stored comment", async () => {
    const harness = await harnessWith(ENABLED);
    const entry = await seedPost(harness);

    // Rendered, then serialised exactly as a browser serialises it — no
    // hand-written body stands in for what the component actually emits.
    const html = renderToStaticMarkup(
      <CommentMarkup
        action="/_plumix/comments/submit"
        entryId={entry.id}
        idBase="c"
        returnTo={`${ORIGIN}/posts/post#comments`}
      />,
    );
    const body = serializeForm(html, {
      name: "Ada",
      email: "ada@example.test",
      body: "posted without a line of javascript",
    });
    expect(body.get("entryId")).toBe(String(entry.id));
    // The honeypot is in what the browser posts, and posts empty.
    expect(body.get("website")).toBe("");

    const res = await formPost(harness, Object.fromEntries(body));

    res.assertStatus(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/posts/post#comments`);
    const stored = await rows(harness);
    expect(stored[0]?.bodyMd).toBe("posted without a line of javascript");
  });

  test("a cross-origin form post is still refused", async () => {
    const harness = await harnessWith(ENABLED);
    const entry = await seedPost(harness);

    const res = await formPost(harness, filled(entry.id), {
      headers: {
        origin: "https://evil.example",
        referer: "https://evil.example/",
      },
    });

    res.assertStatus(403);
    expect(await rows(harness)).toHaveLength(0);
  });

  test("a bot that fills the honeypot is answered exactly as a person is", async () => {
    const harness = await harnessWith(ENABLED);
    const entry = await seedPost(harness);

    const person = await formPost(harness, filled(entry.id));
    const bot = await formPost(
      harness,
      filled(entry.id, { website: "https://spam.example" }),
    );

    bot.assertStatus(303);
    expect(bot.headers.get("location")).toBe(person.headers.get("location"));
    expect(await rows(harness)).toHaveLength(1);
  });
});

describe("where the browser is sent afterwards", () => {
  test("the hidden field beats the Referer", async () => {
    const harness = await harnessWith(ENABLED);
    const entry = await seedPost(harness);

    const res = await formPost(
      harness,
      filled(entry.id, { returnTo: `${ORIGIN}/posts/post#comments` }),
    );

    expect(res.headers.get("location")).toBe(`${ORIGIN}/posts/post#comments`);
  });

  test("an off-origin field cannot make an open redirect of the endpoint", async () => {
    const harness = await harnessWith(ENABLED);
    const entry = await seedPost(harness);

    const res = await formPost(
      harness,
      filled(entry.id, { returnTo: "https://evil.example/phish" }),
    );

    // Falls through to the Referer, which is this site's.
    expect(res.headers.get("location")).toBe(`${ORIGIN}/posts/post`);
  });

  test("a relative field is a path on this site, not a value to discard", async () => {
    const harness = await harnessWith(ENABLED);
    const entry = await seedPost(harness);

    const res = await formPost(
      harness,
      filled(entry.id, { returnTo: "/posts/post#comments" }),
    );

    // What a template naturally passes. Resolved against the request's own
    // URL rather than refused for having no origin of its own.
    expect(res.headers.get("location")).toBe(`${ORIGIN}/posts/post#comments`);
  });

  test("a field pointing at the endpoint cannot make a loop of it", async () => {
    const harness = await harnessWith(ENABLED);
    const entry = await seedPost(harness);

    const res = await formPost(
      harness,
      filled(entry.id, { returnTo: `${ORIGIN}/_plumix/comments/submit` }),
      { headers: { referer: `${ORIGIN}/_plumix/comments/submit` } },
    );

    expect(res.headers.get("location")).toBe("/");
  });
});

describe("a refusal comes back as the form", () => {
  test("carrying the visitor's words and the error against its field", async () => {
    const harness = await harnessWith({
      entryTypes: ["post"],
      mode: "none",
      rateLimit: { max: 1, windowMin: 10 },
    });
    const entry = await seedPost(harness);
    const fields = filled(entry.id, { body: "a comment worth not losing" });

    await formPost(harness, fields);
    const res = await formPost(harness, fields);

    res.assertStatus(429);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const html = await res.text();
    expect(html).toContain("Too many comments");
    expect(html).toContain("a comment worth not losing");
    expect(html).toContain('value="Ada"');
    expect(html).toContain(`value="${String(entry.id)}"`);
    // A refused comment belongs in no index and no shared cache.
    expect(html).toContain('name="robots" content="noindex"');
  });

  test("naming the control the refusal is about", async () => {
    const harness = await harnessWith(ENABLED);
    const entry = await seedPost(harness);

    const res = await formPost(harness, filled(entry.id, { email: "" }));

    res.assertStatus(400);
    const html = await res.text();
    expect(html).toContain("An email address is required.");
    expect(html).toMatch(
      /data-plumix-comment-control="email"[^>]*aria-invalid="true"/,
    );
  });

  test("naming the control a schema refusal is about, where it names one", async () => {
    const harness = await harnessWith(ENABLED);
    const entry = await seedPost(harness);

    // Spaces pass the browser's own `required` check and fail the
    // server's `trim()` — the only way a browser reaches this refusal.
    const res = await formPost(harness, filled(entry.id, { name: "   " }));

    res.assertStatus(400);
    expect(await res.text()).toMatch(
      /data-plumix-comment-control="name"[^>]*aria-invalid="true"/,
    );
  });

  test("and leaves a refusal about no control unattached", async () => {
    const harness = await harnessWith(ENABLED);
    const entry = await seedPost(harness);

    // `entryId` has no control a visitor can correct, so the refusal is
    // about the submission rather than about an answer.
    const res = await formPost(harness, filled(entry.id, { entryId: "12abc" }));

    res.assertStatus(400);
    expect(await res.text()).not.toContain("aria-invalid");
  });

  test("that can be resubmitted, because it still carries the entry", async () => {
    const harness = await harnessWith(ENABLED);
    const entry = await seedPost(harness);

    const refused = await formPost(harness, filled(entry.id, { email: "" }));
    const retry = serializeForm(await refused.text(), {
      email: "ada@example.test",
    });
    const res = await formPost(harness, Object.fromEntries(retry));

    res.assertStatus(303);
    expect((await rows(harness))[0]?.authorEmail).toBe("ada@example.test");
  });
});

describe("the schema stays strict on both paths", () => {
  test("refuses an entry id that is not a number", async () => {
    const harness = await harnessWith(ENABLED);
    await seedPost(harness);

    const res = await formPost(harness, filled(0, { entryId: "12abc" }));

    res.assertStatus(400);
    expect(await rows(harness)).toHaveLength(0);
  });

  test("reads a blank parent as no parent rather than as a bad one", async () => {
    const harness = await harnessWith(ENABLED);
    const entry = await seedPost(harness);

    const res = await formPost(harness, filled(entry.id, { parentId: "" }));

    res.assertStatus(303);
    expect((await rows(harness))[0]?.parentId).toBeNull();
  });

  test("stores a reply under the parent a form posted as a string", async () => {
    const harness = await harnessWith(ENABLED);
    const entry = await seedPost(harness);
    await formPost(harness, filled(entry.id, { body: "root" }));
    const root = (await rows(harness)).find((row) => row.bodyMd === "root");

    await formPost(
      harness,
      filled(entry.id, { body: "reply", parentId: String(root?.id) }),
    );

    const reply = (await rows(harness)).find((row) => row.bodyMd === "reply");
    expect(reply?.parentId).toBe(root?.id);
  });
});

describe("what the answer shape is negotiated on", () => {
  test("a JSON body is answered with JSON even when the caller asks for HTML", async () => {
    const harness = await harnessWith(ENABLED);
    const entry = await seedPost(harness);

    const res = await harness.fetch("/_plumix/comments/submit", {
      method: "POST",
      headers: { accept: "text/html" },
      json: {
        entryId: entry.id,
        name: "Ada",
        email: "ada@example.test",
        body: "scripted",
      },
    });

    res.assertStatus(200);
    expect(await res.json()).toEqual({ status: "approved" });
  });

  test("and is kept out of a shared cache like every other answer", async () => {
    const harness = await harnessWith(ENABLED);
    const entry = await seedPost(harness);

    const res = await harness.fetch("/_plumix/comments/submit", {
      method: "POST",
      json: { entryId: entry.id, name: "Ada", email: "a@b.test", body: "hi" },
    });

    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("what the session swap costs a signed-in author", () => {
  test("their first comment's fast path, and only their first", async () => {
    const harness = await harnessWith({
      entryTypes: ["post"],
      mode: "first_time",
    });
    const entry = await seedPost(harness);
    const author = await harness.factory.user.create({});
    const post = (body: string) =>
      formPost(harness, filled(entry.id, { body }), { as: author });

    await post("first one");
    const first = await rows(harness);
    // The `formPost` exemption hands the handler an authenticator that
    // resolves nobody, so the same cookie that would have been trusted
    // over `fetch` buys nothing here — and the account link is gone with
    // it. Documented on the plugin's docs page rather than worked around:
    // reading the session back would defeat the guard core put there.
    expect(first[0]?.status).toBe("pending");
    expect(first[0]?.authorUserId).toBeNull();

    // Approved by a moderator, as the first comment from any new email is.
    await harness.db.update(commentsTable).set({ status: "approved" });
    await post("second one");

    const after = await rows(harness);
    expect(after.find((row) => row.bodyMd === "second one")?.status).toBe(
      "approved",
    );
  });

  test("but the same author over fetch keeps both", async () => {
    const harness = await harnessWith({ entryTypes: ["post"], mode: "all" });
    const entry = await seedPost(harness);
    const author = await harness.factory.user.create({});

    const res = await harness.fetch("/_plumix/comments/submit", {
      method: "POST",
      as: author,
      json: {
        entryId: entry.id,
        name: "Ada",
        email: "ada@example.test",
        body: "with javascript",
      },
    });

    res.assertStatus(200);
    // The island sets the CSRF header, so the request goes through the
    // ordinary gate and arrives with its session intact: the fast path
    // holds even under `mode: "all"`, and the row keeps its account link.
    expect(await res.json()).toEqual({ status: "approved" });
    expect((await rows(harness))[0]?.authorUserId).toBe(author.id);
  });
});

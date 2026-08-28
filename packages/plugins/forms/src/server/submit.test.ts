import { email, text } from "plumix/fields";
import { describe, expect, test } from "vitest";

import type { FormsHarness } from "../test/harness.js";
import { FORM_SLUG_FIELD, HONEYPOT_FIELD } from "../contract.js";
import { formSubmissions } from "../db/schema.js";
import { defineForm } from "../define-form.js";
import { forms } from "../index.js";
import { createFormsHarness } from "../test/harness.js";

const contact = defineForm("contact", {
  fields: [text("name").label("Your name"), email("email")],
});

const harnessWithContact = () =>
  createFormsHarness([forms({ forms: [contact] })]);

/**
 * What a browser sends for `<form method="post">` on a page with no
 * JavaScript: a urlencoded body, an Origin, and none of the custom header
 * a script would have added.
 */
function submit(
  harness: FormsHarness,
  fields: Record<string, string>,
  headers: Record<string, string> = {},
) {
  return harness.fetch("/_plumix/forms/submit", {
    method: "POST",
    withCsrfHeader: false,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://cms.example",
      referer: "https://cms.example/posts/page-with-form",
      ...headers,
    },
    body: new URLSearchParams({
      [FORM_SLUG_FIELD]: "contact",
      name: "Ada",
      email: "ada@example.test",
      ...fields,
    }).toString(),
  });
}

const rows = (harness: FormsHarness) =>
  harness.db.select().from(formSubmissions);

describe("POST /_plumix/forms/submit", () => {
  test("stores the answers a form posted with no JavaScript", async () => {
    const harness = await harnessWithContact();

    const response = await submit(harness, {});

    response.assertStatus(303);
    expect(response.headers.get("location")).toBe(
      "https://cms.example/posts/page-with-form",
    );
    const [stored] = await rows(harness);
    expect(stored?.formSlug).toBe("contact");
    expect(stored?.status).toBe("new");
    expect(stored?.answers).toEqual({ name: "Ada", email: "ada@example.test" });
  });

  test("numbers each submission within its own form", async () => {
    const harness = await harnessWithContact();

    await submit(harness, {});
    await submit(harness, { name: "Grace" });

    expect((await rows(harness)).map((row) => row.serial)).toEqual([1, 2]);
  });

  test("gives concurrent submissions distinct serials", async () => {
    const harness = await harnessWithContact();

    await Promise.all(Array.from({ length: 6 }, () => submit(harness, {})));

    const serials = (await rows(harness)).map((row) => row.serial);
    expect(new Set(serials).size).toBe(6);
  });

  test("snapshots what each field was called", async () => {
    const harness = await harnessWithContact();

    await submit(harness, {});

    const [stored] = await rows(harness);
    expect(stored?.labels).toEqual({
      name: { label: "Your name" },
      email: { label: "Email" },
    });
  });

  test("answers a filled honeypot like a real submission, and stores it as spam", async () => {
    const harness = await harnessWithContact();

    const response = await submit(harness, { [HONEYPOT_FIELD]: "buy now" });

    response.assertStatus(303);
    const [stored] = await rows(harness);
    expect(stored?.status).toBe("spam");
    expect(stored?.answers).toEqual({ name: "Ada", email: "ada@example.test" });
  });

  test("stores the visitor's address only as a salted hash", async () => {
    const harness = await harnessWithContact();

    await submit(harness, {}, { "cf-connecting-ip": "203.0.113.7" });

    const [stored] = await rows(harness);
    expect(stored?.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain("203.0.113.7");
  });

  test("drops an input the form never declared", async () => {
    const harness = await harnessWithContact();

    await submit(harness, { role: "admin" });

    const [stored] = await rows(harness);
    expect(stored?.answers).not.toHaveProperty("role");
  });

  test("refuses an oversized body before parsing it", async () => {
    const harness = await harnessWithContact();

    const response = await submit(harness, { name: "x".repeat(70_000) });

    response.assertStatus(413);
    expect(await rows(harness)).toHaveLength(0);
  });

  test("answers 404 for a slug nobody registered", async () => {
    const harness = await harnessWithContact();

    const response = await submit(harness, { [FORM_SLUG_FIELD]: "ghost" });

    response.assertStatus(404);
    expect(await rows(harness)).toHaveLength(0);
  });

  test("ignores a Referer pointing off-site", async () => {
    const harness = await harnessWithContact();

    const response = await submit(
      harness,
      {},
      {
        referer: "https://evil.example/steal",
      },
    );

    expect(response.headers.get("location")).toBe("/");
  });

  test("refuses a cross-site post that carries no Origin", async () => {
    const harness = await harnessWithContact();

    const response = await harness.fetch("/_plumix/forms/submit", {
      method: "POST",
      withCsrfHeader: false,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ [FORM_SLUG_FIELD]: "contact" }).toString(),
    });

    response.assertStatus(403);
    expect(await rows(harness)).toHaveLength(0);
  });
});

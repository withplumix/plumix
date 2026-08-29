import type { PluginSetupContext } from "plumix/plugin";
import {
  date,
  email,
  number,
  select,
  text,
  textarea,
  toggle,
  url,
} from "plumix/fields";
import { definePlugin } from "plumix/plugin";
import { describe, expect, test, vi } from "vitest";

import type { FormDefinition, FormHandler } from "../define-form.js";
import type { FormsHarness } from "../test/harness.js";
import type { FormSubmissionCandidate } from "../types.js";
import {
  FORM_SLUG_FIELD,
  HONEYPOT_FIELD,
  RETURN_FIELD,
  TOKEN_FIELD,
} from "../contract.js";
import { formSubmissions } from "../db/schema.js";
import { defineForm } from "../define-form.js";
import { tel } from "../fields.js";
import { forms } from "../index.js";
import { pageBreak } from "../steps.js";
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
function post(
  harness: FormsHarness,
  body: URLSearchParams,
  headers: Record<string, string> = {},
) {
  return harness.fetch("/_plumix/forms/submit", {
    method: "POST",
    withCsrfHeader: false,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://cms.example",
      ...headers,
    },
    body: body.toString(),
  });
}

/** A submission of the `contact` form, its answers filled in by default. */
function submit(
  harness: FormsHarness,
  fields: Record<string, string> = {},
  headers: Record<string, string> = {},
) {
  return post(
    harness,
    new URLSearchParams({
      [FORM_SLUG_FIELD]: "contact",
      name: "Ada",
      email: "ada@example.test",
      ...fields,
    }),
    { referer: "https://cms.example/posts/page-with-form", ...headers },
  );
}

const rows = (harness: FormsHarness) =>
  harness.db.select().from(formSubmissions);

/** Post `answers` verbatim to `form` — nothing filled in for the caller. */
async function submitTo(
  form: FormDefinition,
  answers: readonly [string, string][],
): Promise<FormsHarness> {
  const harness = await createFormsHarness([forms({ forms: [form] })]);
  const response = await post(
    harness,
    new URLSearchParams([[FORM_SLUG_FIELD, form.slug], ...answers]),
  );
  response.assertStatus(303);
  return harness;
}

const storedAnswers = async (harness: FormsHarness) =>
  (await rows(harness))[0]?.answers;

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

describe("the answers a submission stores", () => {
  const roster = defineForm("roster", {
    fields: [
      text("name"),
      email("email"),
      url("website"),
      tel("phone"),
      number("guests"),
      date("visitOn"),
      select("plan").options(["basic", "pro"]),
      select("topics").options(["news", "events"]).multiple(),
      toggle("newsletter"),
      textarea("message"),
    ],
  });

  test("carry each field's value in the shape that field stores", async () => {
    const harness = await submitTo(roster, [
      ["name", "Ada"],
      ["email", "ada@example.test"],
      ["website", "https://ada.example"],
      ["phone", "+44 20 7946 0958"],
      ["guests", "3"],
      ["visitOn", "2026-09-01"],
      ["plan", "pro"],
      ["topics", "news"],
      ["topics", "events"],
      ["newsletter", "on"],
      ["message", "Hello"],
    ]);

    expect(await storedAnswers(harness)).toEqual({
      name: "Ada",
      email: "ada@example.test",
      website: "https://ada.example",
      phone: "+44 20 7946 0958",
      guests: 3,
      visitOn: "2026-09-01",
      plan: "pro",
      topics: ["news", "events"],
      newsletter: true,
      message: "Hello",
    });
  });

  test("leave a blank answer out, and read an absent checkbox as false", async () => {
    const harness = await submitTo(roster, [
      ["name", "Ada"],
      ["email", ""],
      ["guests", ""],
      ["plan", ""],
    ]);

    expect(await storedAnswers(harness)).toEqual({
      name: "Ada",
      topics: [],
      newsletter: false,
    });
  });

  test("drop a choice the form never offered", async () => {
    const harness = await submitTo(roster, [["plan", "enterprise"]]);

    expect(await storedAnswers(harness)).not.toHaveProperty("plan");
  });

  test("drop a number that is not one", async () => {
    const harness = await submitTo(roster, [["guests", "many"]]);

    expect(await storedAnswers(harness)).not.toHaveProperty("guests");
  });
});

describe("a field its condition hid", () => {
  const plan = select("plan").options(["basic", "pro"]);
  const conditional = defineForm("signup", {
    fields: [plan, text("seats").required().visibleWhen(plan.is("pro"))],
  });

  test("is stored when the answers make it visible", async () => {
    const harness = await submitTo(conditional, [
      ["plan", "pro"],
      ["seats", "12"],
    ]);

    expect(await storedAnswers(harness)).toEqual({ plan: "pro", seats: "12" });
  });

  test("is absent from the payload even when the body carried one", async () => {
    const harness = await submitTo(conditional, [
      ["plan", "basic"],
      ["seats", "12"],
    ]);

    expect(await storedAnswers(harness)).toEqual({ plan: "basic" });
  });

  test("is not held to its own required constraint", async () => {
    const harness = await submitTo(conditional, [["plan", "basic"]]);

    expect(await storedAnswers(harness)).toEqual({ plan: "basic" });
  });

  test("leaves no trace in the label snapshot either", async () => {
    const harness = await submitTo(conditional, [["plan", "basic"]]);

    expect((await rows(harness))[0]?.labels).toEqual({
      plan: { label: "Plan", options: { basic: "Basic", pro: "Pro" } },
    });
  });
});

describe("a form broken into steps", () => {
  // The wizard is a rendering of this list, not a change to it: one
  // submission arrives carrying every step's answers, and the handler
  // never learns the visitor answered them a page at a time.
  const plan = select("plan").options(["basic", "pro"]);
  const wizard = defineForm("wizard", {
    fields: [
      text("name").required(),
      pageBreak("Your plan"),
      plan,
      text("seats").visibleWhen(plan.is("pro")),
    ],
  });

  test("stores what every step gathered as one submission", async () => {
    const harness = await submitTo(wizard, [
      ["name", "Ada"],
      ["plan", "pro"],
      ["seats", "12"],
    ]);

    expect(await storedAnswers(harness)).toEqual({
      name: "Ada",
      plan: "pro",
      seats: "12",
    });
  });

  test("drops an answer a driver on an earlier step hides", async () => {
    const harness = await submitTo(wizard, [
      ["name", "Ada"],
      ["plan", "basic"],
      ["seats", "12"],
    ]);

    expect(await storedAnswers(harness)).toEqual({
      name: "Ada",
      plan: "basic",
    });
  });
});

const signup = defineForm("signup", {
  fields: [text("name").label("Your name").required(), email("email")],
});

const harnessWithSignup = () =>
  createFormsHarness([forms({ forms: [signup] })]);

/** A submission of the `signup` form, its answers filled in by default. */
function submitSignup(
  harness: FormsHarness,
  fields: Record<string, string> = {},
  headers: Record<string, string> = {},
) {
  return post(
    harness,
    new URLSearchParams({
      [FORM_SLUG_FIELD]: "signup",
      name: "Ada",
      email: "ada@example.test",
      ...fields,
    }),
    { referer: "https://cms.example/posts/page-with-form", ...headers },
  );
}

/** The same submission, asking for the envelope the island reads. */
const submitAsIsland = (
  harness: FormsHarness,
  fields: Record<string, string> = {},
) => submitSignup(harness, fields, { accept: "application/json" });

describe("a submission the island makes", () => {
  test("answers a stored submission with a success envelope", async () => {
    const harness = await harnessWithSignup();

    const response = await submitAsIsland(harness);

    response.assertStatus(200);
    const body = await response.json<{ ok: boolean; message: string }>();
    expect(body.ok).toBe(true);
    expect(body.message.length).toBeGreaterThan(0);
    expect(await storedAnswers(harness)).toEqual({
      name: "Ada",
      email: "ada@example.test",
    });
  });

  test("returns the answer to a submission uncached", async () => {
    const harness = await harnessWithSignup();

    const response = await submitAsIsland(harness);

    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("validation", () => {
  test("names the field a required answer is missing from, and stores nothing", async () => {
    const harness = await harnessWithSignup();

    const response = await submitAsIsland(harness, { name: "" });

    response.assertStatus(422);
    expect(await response.json()).toEqual({
      ok: false,
      errors: [{ field: "name", message: "Your name is required." }],
    });
    expect(await rows(harness)).toHaveLength(0);
  });

  test("rejects an email address the field cannot accept", async () => {
    const harness = await harnessWithSignup();

    const response = await submitAsIsland(harness, { email: "ada-at-example" });

    response.assertStatus(422);
    const body = await response.json<{ errors: { field: string }[] }>();
    expect(body.errors.map((error) => error.field)).toEqual(["email"]);
  });

  test("reports every field that failed, not just the first", async () => {
    const harness = await harnessWithSignup();

    const response = await submitAsIsland(harness, { name: "", email: "nope" });

    const body = await response.json<{ errors: { field: string }[] }>();
    expect(body.errors.map((error) => error.field)).toEqual(["name", "email"]);
  });

  test("holds a number to the bounds its field declared", async () => {
    const guests = defineForm("guests", {
      fields: [number("guests").label("Guests").min(1).max(4)],
    });
    const harness = await createFormsHarness([forms({ forms: [guests] })]);

    const response = await post(
      harness,
      new URLSearchParams({ [FORM_SLUG_FIELD]: "guests", guests: "9" }),
      { accept: "application/json" },
    );

    response.assertStatus(422);
    const body = await response.json<{ errors: { field: string }[] }>();
    expect(body.errors.map((error) => error.field)).toEqual(["guests"]);
  });

  test("never insists on a required answer the visitor's own answers hid", async () => {
    const tier = select("tier").options(["basic", "pro"]);
    const upgrade = defineForm("upgrade", {
      fields: [
        tier,
        text("seats").label("Seats").required().visibleWhen(tier.is("pro")),
      ],
    });
    const harness = await createFormsHarness([forms({ forms: [upgrade] })]);

    const response = await post(
      harness,
      new URLSearchParams({ [FORM_SLUG_FIELD]: "upgrade", tier: "basic" }),
      { accept: "application/json" },
    );

    response.assertStatus(200);
    expect(await rows(harness)).toHaveLength(1);
  });

  test("answers a trapped submission that also fails validation like any other rejected one", async () => {
    const harness = await harnessWithSignup();

    const response = await submitAsIsland(harness, {
      name: "",
      [HONEYPOT_FIELD]: "buy now",
    });

    // Validation runs first, so a bot filling the trap is told exactly
    // what a person answering badly is told — and nothing is stored,
    // which is what a failed submission stores for anyone.
    response.assertStatus(422);
    expect(await rows(harness)).toHaveLength(0);
  });
});

describe("a rejected submit with no JavaScript", () => {
  test("re-renders the form with the errors and what the visitor answered", async () => {
    const harness = await harnessWithSignup();

    const response = await submitSignup(harness, { name: "" });

    response.assertStatus(422);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const html = await response.text();
    expect(html).toContain("Your name is required.");
    expect(html).toContain('value="ada@example.test"');
    expect(html).toContain('action="/_plumix/forms/submit"');
    expect(await rows(harness)).toHaveLength(0);
  });

  test("carries the page forward, so the retry lands there and not on the endpoint", async () => {
    const harness = await harnessWithSignup();

    const rejected = await submitSignup(harness, { name: "" });
    expect(await rejected.text()).toContain(
      'value="https://cms.example/posts/page-with-form"',
    );

    // The retry: the visitor's browser now reports the endpoint as the
    // referer, because that is the document they are on.
    const retried = await submitSignup(
      harness,
      { [RETURN_FIELD]: "https://cms.example/posts/page-with-form" },
      { referer: "https://cms.example/_plumix/forms/submit" },
    );

    retried.assertStatus(303);
    expect(retried.headers.get("location")).toBe(
      "https://cms.example/posts/page-with-form",
    );
  });

  test("refuses a return field pointing off-site", async () => {
    const harness = await harnessWithSignup();

    // The field is the visitor's to set, so it is held to this site the
    // same way the Referer is — here it is passed over for the Referer.
    const response = await submitSignup(harness, {
      [RETURN_FIELD]: "https://evil.example/steal",
    });

    expect(response.headers.get("location")).toBe(
      "https://cms.example/posts/page-with-form",
    );
  });
});

describe("the timing token", () => {
  const fetchToken = (harness: FormsHarness) =>
    harness.fetch("/_plumix/forms/token", {
      headers: { origin: "https://cms.example" },
    });

  const issueToken = async (harness: FormsHarness): Promise<string> =>
    (await (await fetchToken(harness)).json<{ token: string }>()).token;

  test("is issued from an endpoint nothing may cache", async () => {
    const harness = await harnessWithSignup();

    const response = await fetchToken(harness);

    response.assertStatus(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    // An issue time and the signature over it — nothing about the visitor.
    const { token } = await response.json<{ token: string }>();
    expect(token).toMatch(/^\d+\.[\da-f]{64}$/);
  });

  test("files a submission completed implausibly fast as spam, and answers it like any other", async () => {
    const harness = await harnessWithSignup();
    const token = await issueToken(harness);

    const response = await submitAsIsland(harness, { [TOKEN_FIELD]: token });

    response.assertStatus(200);
    expect((await rows(harness))[0]?.status).toBe("spam");
  });

  test("accepts a submission the visitor took a plausible time over", async () => {
    const harness = await harnessWithSignup();
    const token = await issueToken(harness);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 30_000);
    try {
      await submitSignup(harness, { [TOKEN_FIELD]: token });
    } finally {
      vi.useRealTimers();
    }

    expect((await rows(harness))[0]?.status).toBe("new");
  });

  test("files a forged token as spam", async () => {
    const harness = await harnessWithSignup();

    await submitSignup(harness, {
      [TOKEN_FIELD]: `${String(Date.now() - 60_000)}.deadbeef`,
    });

    expect((await rows(harness))[0]?.status).toBe("spam");
  });

  test("takes a submission carrying no token, which is what no JavaScript sends", async () => {
    const harness = await harnessWithSignup();

    await submitSignup(harness);

    expect((await rows(harness))[0]?.status).toBe("new");
  });
});

/** One form, one harness — the shape every case below needs. */
const harnessWith = (form: FormDefinition) =>
  createFormsHarness([forms({ forms: [form] })]);

/** Post `fields` to `form`, asking for the envelope the island reads. */
const submitJson = (
  harness: FormsHarness,
  slug: string,
  fields: Record<string, string> = {},
) =>
  post(harness, new URLSearchParams({ [FORM_SLUG_FIELD]: slug, ...fields }), {
    accept: "application/json",
  });

describe("a form's own validate", () => {
  const enquiry = defineForm("enquiry", {
    fields: [text("name"), number("guests")],
    validate: ({ answers }) =>
      answers.guests !== undefined && answers.guests > 4
        ? [{ field: "guests", message: "We seat four." }]
        : undefined,
  });

  test("returns its errors against the fields they name, and stores nothing", async () => {
    const harness = await harnessWith(enquiry);

    const response = await submitJson(harness, "enquiry", { guests: "6" });

    response.assertStatus(422);
    expect(await response.json()).toEqual({
      ok: false,
      errors: [{ field: "guests", message: "We seat four." }],
    });
    expect(await rows(harness)).toHaveLength(0);
  });

  test("stores the submission when it returns nothing", async () => {
    const harness = await harnessWith(enquiry);

    const response = await submitJson(harness, "enquiry", {
      name: "Ada",
      guests: "2",
    });

    response.assertStatus(200);
    expect(await storedAnswers(harness)).toEqual({ name: "Ada", guests: 2 });
  });

  test("renders its errors as the form again for a visitor with no JavaScript", async () => {
    const harness = await harnessWith(enquiry);

    const response = await post(
      harness,
      new URLSearchParams({ [FORM_SLUG_FIELD]: "enquiry", guests: "6" }),
    );

    response.assertStatus(422);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("We seat four.");
  });

  test("may take its time and read the request context", async () => {
    const seen: string[] = [];
    const asyncCheck = defineForm("async_check", {
      fields: [text("name")],
      validate: async ({ ctx }) => {
        await Promise.resolve();
        seen.push(new URL(ctx.request.url).pathname);
        return [{ field: "name", message: "Not today." }];
      },
    });
    const harness = await harnessWith(asyncCheck);

    const response = await submitJson(harness, "async_check", { name: "Ada" });

    response.assertStatus(422);
    expect(seen).toEqual(["/_plumix/forms/submit"]);
  });

  test("is never asked about answers the field rules already refused", async () => {
    const validate = vi.fn(() => undefined);
    const strict = defineForm("strict", {
      fields: [text("name").required()],
      validate,
    });
    const harness = await harnessWith(strict);

    await submitJson(harness, "strict", { name: "" });

    expect(validate).not.toHaveBeenCalled();
  });
});

describe("a form's onSubmit", () => {
  const throwing = defineForm("enquiry", {
    fields: [text("name")],
    onSubmit: () => {
      throw new Error("SMTP refused");
    },
  });

  const handledBy = (onSubmit: FormHandler) =>
    defineForm("enquiry", { fields: [text("name")], onSubmit });

  test("runs with the submission already stored, over the answers the row holds", async () => {
    const seen: { id: number | null; answers: unknown }[] = [];
    const harness = await harnessWith(
      handledBy(({ submission, answers }) => {
        seen.push({ id: submission?.id ?? null, answers });
      }),
    );

    await submitJson(harness, "enquiry", { name: "Ada" });

    const [stored] = await rows(harness);
    expect(seen).toEqual([{ id: stored?.id, answers: { name: "Ada" } }]);
  });

  test("leaves the submission stored, answers success, and records why it did not finish", async () => {
    const harness = await harnessWith(throwing);

    const response = await submitJson(harness, "enquiry", { name: "Ada" });

    response.assertStatus(200);
    const body = await response.json<{ ok: boolean }>();
    expect(body.ok).toBe(true);
    const [stored] = await rows(harness);
    expect(stored?.answers).toEqual({ name: "Ada" });
    expect(stored?.handlerError).toBe("SMTP refused");
  });

  test("leaves the row unmarked when it finishes", async () => {
    const harness = await harnessWith(handledBy(() => undefined));

    await submitJson(harness, "enquiry", { name: "Ada" });

    expect((await rows(harness))[0]?.handlerError).toBeNull();
  });

  test("is not run for a submission the spam floor caught", async () => {
    const onSubmit = vi.fn(() => undefined);
    const harness = await harnessWith(handledBy(onSubmit));

    await submitJson(harness, "enquiry", {
      name: "Ada",
      [HONEYPOT_FIELD]: "buy now",
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect((await rows(harness))[0]?.status).toBe("spam");
  });

  test("is not run for a submission the form refused", async () => {
    const onSubmit = vi.fn(() => undefined);
    const refusing = defineForm("enquiry", {
      fields: [text("name").required()],
      onSubmit,
    });
    const harness = await harnessWith(refusing);

    await submitJson(harness, "enquiry", { name: "" });

    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("a form that opts out of storage", () => {
  const direct = (onSubmit: FormHandler) =>
    defineForm("direct", {
      fields: [text("name").required()],
      onSubmit,
      store: false,
    });

  test("stores nothing and still runs its handler", async () => {
    const seen: unknown[] = [];
    const harness = await harnessWith(
      direct(({ answers, submission }) => {
        seen.push({ answers, submission });
      }),
    );

    const response = await submitJson(harness, "direct", { name: "Ada" });

    response.assertStatus(200);
    expect(await rows(harness)).toHaveLength(0);
    expect(seen).toEqual([{ answers: { name: "Ada" }, submission: null }]);
  });

  test("is still validated", async () => {
    const harness = await harnessWith(direct(() => undefined));

    const response = await submitJson(harness, "direct", { name: "" });

    response.assertStatus(422);
  });

  test("answers success even when its handler throws", async () => {
    const harness = await harnessWith(
      direct(() => {
        throw new Error("SMTP refused");
      }),
    );

    const response = await submitJson(harness, "direct", { name: "Ada" });

    response.assertStatus(200);
    expect(await rows(harness)).toHaveLength(0);
  });

  test("drops a submission the spam floor caught, having nothing to hold it", async () => {
    const onSubmit = vi.fn(() => undefined);
    const harness = await harnessWith(direct(onSubmit));

    const response = await submitJson(harness, "direct", {
      name: "Ada",
      [HONEYPOT_FIELD]: "buy now",
    });

    response.assertStatus(200);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(await rows(harness)).toHaveLength(0);
  });
});

describe("the cross-cutting hooks", () => {
  const listener = (setup: (ctx: PluginSetupContext) => void) =>
    definePlugin("forms_listener", setup);

  const withListener = (
    form: FormDefinition,
    setup: (ctx: PluginSetupContext) => void,
  ) => createFormsHarness([forms({ forms: [form] }), listener(setup)]);

  test("form:validate rejects a submission with the errors it returns", async () => {
    const harness = await withListener(signup, (ctx) => {
      ctx.addFilter("form:validate", (errors) => [
        ...errors,
        { field: "email", message: "That address is blocked." },
      ]);
    });

    const response = await submitAsIsland(harness);

    response.assertStatus(422);
    expect(await response.json()).toEqual({
      ok: false,
      errors: [{ field: "email", message: "That address is blocked." }],
    });
    expect(await rows(harness)).toHaveLength(0);
  });

  test("form:validate sees a submission every other check accepted", async () => {
    const seen: FormSubmissionCandidate[] = [];
    const harness = await withListener(signup, (ctx) => {
      ctx.addFilter("form:validate", (errors, candidate) => {
        seen.push(candidate);
        return errors;
      });
    });

    await submitAsIsland(harness, { [HONEYPOT_FIELD]: "buy now" });

    const [candidate] = seen;
    expect(candidate?.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(seen.map((one) => ({ ...one, ipHash: null }))).toEqual([
      {
        form: "signup",
        answers: { name: "Ada", email: "ada@example.test" },
        labels: {
          name: { label: "Your name" },
          email: { label: "Email" },
        },
        status: "spam",
        ipHash: null,
        userAgent: null,
      },
    ]);
  });

  test("form:submitted fires with the stored row", async () => {
    const seen: (number | null)[] = [];
    const harness = await withListener(signup, (ctx) => {
      ctx.addAction("form:submitted", (submission) => {
        seen.push(submission?.id ?? null);
      });
    });

    await submitAsIsland(harness);

    const [stored] = await rows(harness);
    expect(seen).toEqual([stored?.id]);
  });

  test("form:submitted fires after the handler, carrying its failure", async () => {
    const order: string[] = [];
    const failing = defineForm("failing", {
      fields: [text("name")],
      onSubmit: () => {
        order.push("handler");
        throw new Error("SMTP refused");
      },
    });
    const harness = await withListener(failing, (ctx) => {
      ctx.addAction("form:submitted", (submission) => {
        order.push(`action:${submission?.handlerError ?? ""}`);
      });
    });

    await post(
      harness,
      new URLSearchParams({ [FORM_SLUG_FIELD]: "failing", name: "Ada" }),
    );

    expect(order).toEqual(["handler", "action:SMTP refused"]);
  });

  test("form:submitted fires with no row for a form that stores nothing", async () => {
    const seen: unknown[] = [];
    const ephemeral = defineForm("ephemeral", {
      fields: [text("name")],
      store: false,
      onSubmit: () => undefined,
    });
    const harness = await withListener(ephemeral, (ctx) => {
      ctx.addAction("form:submitted", (submission, candidate) => {
        seen.push({ submission, form: candidate.form });
      });
    });

    await post(
      harness,
      new URLSearchParams({ [FORM_SLUG_FIELD]: "ephemeral", name: "Ada" }),
    );

    expect(seen).toEqual([{ submission: null, form: "ephemeral" }]);
  });

  test("form:submitted does not fire for a submission that was refused", async () => {
    const fired = vi.fn();
    const harness = await withListener(signup, (ctx) => {
      ctx.addAction("form:submitted", fired);
    });

    const response = await submitAsIsland(harness, { name: "" });

    response.assertStatus(422);
    expect(fired).not.toHaveBeenCalled();
  });
});

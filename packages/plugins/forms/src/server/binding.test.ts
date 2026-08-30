import { and, eq } from "drizzle-orm";
import { email, text } from "plumix/fields";
import { settings } from "plumix/schema";
import { describe, expect, test, vi } from "vitest";

import type { FormSubmitEvent } from "../define-form.js";
import type { FormsHarness } from "../test/harness.js";
import { BOUND_FIELD, FORM_SLUG_FIELD } from "../contract.js";
import { formSubmissions } from "../db/schema.js";
import { defineForm } from "../define-form.js";
import { forms } from "../index.js";
import { createFormsHarness, seedPageWithForm } from "../test/harness.js";

const subscribe = defineForm("subscribe", {
  bind: "entry",
  fields: [email("email")],
});

const alsoBound = defineForm("also-bound", {
  bind: "entry",
  fields: [email("email")],
});

const contact = defineForm("contact", {
  fields: [text("name"), email("email")],
});

const termBound = defineForm("term-bound", {
  bind: "term",
  fields: [email("email")],
});

async function renderPage(
  harness: FormsHarness,
  path = "page-with-form",
): Promise<string> {
  const response = await harness.fetch(`/posts/${path}`);
  response.assertStatus(200);
  return response.text();
}

/** The value of the form's bound hidden input, or null when it has none. */
function boundToken(html: string): string | null {
  const match = new RegExp(`name="${BOUND_FIELD}" value="([^"]*)"`, "u").exec(
    html,
  );
  return match?.[1] ?? null;
}

describe("a form that binds the page it is placed on", () => {
  test("carries a token for that entry without the page wiring one", async () => {
    const harness = await createFormsHarness([forms({ forms: [subscribe] })]);
    const entry = await seedPageWithForm(harness, "subscribe");

    const token = await mintParts(harness);

    expect(token.type).toBe("entry");
    expect(token.id).toBe(String(entry.id));
  });

  test("carries the entry nowhere in the markup unsigned", async () => {
    const harness = await createFormsHarness([forms({ forms: [subscribe] })]);
    const entry = await seedPageWithForm(harness, "subscribe");

    const html = await renderPage(harness);

    // Not "the id appears nowhere" — it is inside the token, which is the
    // point. Nothing may carry it as a value of its own.
    const values = [...html.matchAll(/value="([^"]*)"/gu)].map((at) => at[1]);
    expect(values).not.toContain(String(entry.id));
  });

  test("carries nothing on a page with no entry to bind", async () => {
    const harness = await createFormsHarness([forms({ forms: [subscribe] })]);
    await seedPageWithForm(harness, "subscribe");

    // The archive the seeded post is listed on, rather than its own page.
    const response = await harness.fetch("/posts");

    response.assertStatus(200);
    expect(boundToken(await response.text())).toBeNull();
  });

  test("carries nothing when the form did not ask to bind", async () => {
    const harness = await createFormsHarness([forms({ forms: [contact] })]);
    await seedPageWithForm(harness, "contact");

    expect(boundToken(await renderPage(harness))).toBeNull();
  });

  test("carries nothing when the page is not the kind it asked for", async () => {
    const harness = await createFormsHarness([forms({ forms: [termBound] })]);
    await seedPageWithForm(harness, "term-bound");

    // The same answer an archive gets, rather than the entry's id under
    // a term's name.
    expect(boundToken(await renderPage(harness))).toBeNull();
  });
});

/** What a browser posts for a bound form, answered as `answers` says. */
function post(
  harness: FormsHarness,
  bound: string | null,
  slug = "subscribe",
  answers: Record<string, string> = { email: "ada@example.test" },
) {
  const body = new URLSearchParams({ [FORM_SLUG_FIELD]: slug, ...answers });
  if (bound !== null) body.set(BOUND_FIELD, bound);
  return harness.fetch("/_plumix/forms/submit", {
    method: "POST",
    withCsrfHeader: false,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://cms.example",
    },
    body: body.toString(),
  });
}

/** Render the bound form's page and hand back the token it carries. */
async function mint(
  harness: FormsHarness,
  path = "page-with-form",
): Promise<string> {
  const token = boundToken(await renderPage(harness, path));
  if (token === null) throw new Error("the page carried no bound token");
  return token;
}

interface TokenParts {
  readonly type: string;
  readonly id: string;
  readonly signature: string;
}

/** A minted token, split into the three parts it is spelled from. */
async function mintParts(
  harness: FormsHarness,
  path = "page-with-form",
): Promise<TokenParts> {
  const [type = "", id = "", signature = ""] = (
    await mint(harness, path)
  ).split(".");
  return { type, id, signature };
}

const spell = ({ type, id, signature }: TokenParts): string =>
  `${type}.${id}.${signature}`;

const rows = (harness: FormsHarness) =>
  harness.db.select().from(formSubmissions);

describe("a submission carrying a bound entry", () => {
  test("stores what it was bound to in its own columns", async () => {
    const harness = await createFormsHarness([forms({ forms: [subscribe] })]);
    const entry = await seedPageWithForm(harness, "subscribe");

    const response = await post(harness, await mint(harness));

    response.assertStatus(303);
    const [row] = await rows(harness);
    expect(row?.boundType).toBe("entry");
    expect(row?.boundId).toBe(entry.id);
  });

  test("stores no entry for a form that binds nothing", async () => {
    const harness = await createFormsHarness([forms({ forms: [contact] })]);
    await seedPageWithForm(harness, "contact");

    const response = await post(harness, null, "contact");

    response.assertStatus(303);
    const [row] = await rows(harness);
    expect(row?.boundType).toBeNull();
    expect(row?.boundId).toBeNull();
  });

  test("answers every submission for one bound row as a query, not a scan", async () => {
    const harness = await createFormsHarness([forms({ forms: [subscribe] })]);
    const school = await seedPageWithForm(harness, "subscribe");
    await seedPageWithForm(harness, "subscribe", "other-school");
    await post(harness, await mint(harness));
    await post(harness, await mint(harness));
    await post(harness, await mint(harness, "other-school"));

    const forSchool = await harness.db
      .select()
      .from(formSubmissions)
      .where(
        and(
          eq(formSubmissions.boundType, "entry"),
          eq(formSubmissions.boundId, school.id),
        ),
      );

    expect(forSchool).toHaveLength(2);
  });

  test("hands the form's own validate the entry it was bound to", async () => {
    const seen: (number | null)[] = [];
    const harness = await createFormsHarness([
      forms({
        forms: [
          defineForm("bound", {
            bind: "entry",
            fields: [email("email")],
            validate: ({ bound }) => {
              seen.push(bound?.id ?? null);
            },
          }),
        ],
      }),
    ]);
    const entry = await seedPageWithForm(harness, "bound");

    await post(harness, await mint(harness), "bound");

    expect(seen).toEqual([entry.id]);
  });

  test("hands the form's own handler the entry it was bound to", async () => {
    const onSubmit = vi.fn<(event: FormSubmitEvent<unknown>) => void>();
    const harness = await createFormsHarness([
      forms({
        forms: [
          defineForm("bound", {
            bind: "entry",
            fields: [email("email")],
            onSubmit,
          }),
        ],
      }),
    ]);
    const entry = await seedPageWithForm(harness, "bound");

    await post(harness, await mint(harness), "bound");

    expect(onSubmit.mock.calls[0]?.[0].bound).toEqual({
      type: "entry",
      id: entry.id,
    });
  });
});

describe("a bound token this install did not sign", () => {
  test("is refused when its entry has been edited", async () => {
    const harness = await createFormsHarness([forms({ forms: [subscribe] })]);
    await seedPageWithForm(harness, "subscribe");
    const token = await mintParts(harness);

    const response = await post(harness, spell({ ...token, id: "999" }));

    response.assertStatus(403);
    expect(await rows(harness)).toHaveLength(0);
  });

  test("is refused when it was minted for another form", async () => {
    const harness = await createFormsHarness([
      forms({ forms: [subscribe, alsoBound] }),
    ]);
    await seedPageWithForm(harness, "subscribe");

    const response = await post(harness, await mint(harness), "also-bound");

    response.assertStatus(403);
    expect(await rows(harness)).toHaveLength(0);
  });

  test("is refused when a byte of its signature is flipped", async () => {
    const harness = await createFormsHarness([forms({ forms: [subscribe] })]);
    await seedPageWithForm(harness, "subscribe");
    const token = await mintParts(harness);
    const { signature } = token;
    const flipped = signature.startsWith("0")
      ? `1${signature.slice(1)}`
      : `0${signature.slice(1)}`;

    const response = await post(
      harness,
      spell({ ...token, signature: flipped }),
    );

    response.assertStatus(403);
    expect(await rows(harness)).toHaveLength(0);
  });

  test("is refused when its entry is spelled another way", async () => {
    const harness = await createFormsHarness([forms({ forms: [subscribe] })]);
    await seedPageWithForm(harness, "subscribe");
    const token = await mintParts(harness);

    const padded = await post(harness, spell({ ...token, id: `0${token.id}` }));
    const trailing = await post(harness, `${spell(token)}.junk`);

    padded.assertStatus(403);
    trailing.assertStatus(403);
    expect(await rows(harness)).toHaveLength(0);
  });

  test("is refused when it is a timing token, signed under another secret", async () => {
    const harness = await createFormsHarness([forms({ forms: [subscribe] })]);
    await seedPageWithForm(harness, "subscribe");
    const timing = await harness.fetch("/_plumix/forms/token", {
      headers: { accept: "application/json" },
    });
    const { token } = await timing.json<{ token: string }>();

    const response = await post(harness, token);

    response.assertStatus(403);
    expect(await rows(harness)).toHaveLength(0);
  });

  test("is refused when its kind has been rewritten", async () => {
    const harness = await createFormsHarness([forms({ forms: [subscribe] })]);
    await seedPageWithForm(harness, "subscribe");
    const token = await mintParts(harness);

    // The signature covers the kind as well as the id, which is what
    // stops entry 7's token from being posted as term 7.
    const response = await post(harness, spell({ ...token, type: "term" }));

    response.assertStatus(403);
    expect(await rows(harness)).toHaveLength(0);
  });

  test("is refused when its kind is not one a form can bind", async () => {
    const harness = await createFormsHarness([forms({ forms: [subscribe] })]);
    await seedPageWithForm(harness, "subscribe");
    const token = await mintParts(harness);

    const response = await post(harness, spell({ ...token, type: "archive" }));

    response.assertStatus(403);
    expect(await rows(harness)).toHaveLength(0);
  });

  test("is refused when it is a bare id with no signature", async () => {
    const harness = await createFormsHarness([forms({ forms: [subscribe] })]);
    const entry = await seedPageWithForm(harness, "subscribe");

    const response = await post(harness, `entry.${String(entry.id)}`);

    response.assertStatus(403);
    expect(await rows(harness)).toHaveLength(0);
  });
});

describe("a form whose bind changed under a cached page", () => {
  /**
   * What makes two harnesses one install: the bind secret. Copied from
   * the one that minted the token to the one that receives it, so the
   * token verifies and the only difference left is the kind the form now
   * declares — which is the state a site is in after editing `bind`
   * while the edge still serves pages rendered before the edit.
   */
  async function shareSecret(
    from: FormsHarness,
    to: FormsHarness,
  ): Promise<void> {
    const where = and(
      eq(settings.group, "forms_internal"),
      eq(settings.key, "bind_secret"),
    );
    const [row] = await from.db.select().from(settings).where(where);
    if (!row) throw new Error("the minting harness kept no bind secret");
    await to.db.insert(settings).values(row);
  }

  test("stores nothing for a token naming the kind it used to bind", async () => {
    const wasEntry = await createFormsHarness([forms({ forms: [subscribe] })]);
    await seedPageWithForm(wasEntry, "subscribe");
    const cached = await mint(wasEntry);

    const nowTerm = await createFormsHarness([
      forms({
        forms: [
          defineForm("subscribe", { bind: "term", fields: [email("email")] }),
        ],
      }),
    ]);
    await seedPageWithForm(nowTerm, "subscribe");
    await shareSecret(wasEntry, nowTerm);
    const response = await post(nowTerm, cached);

    // Accepted, not refused: the visitor is holding a page this site
    // served them, and the edit was the site's. Stored as nothing,
    // because storing it would hand a handler written for terms an
    // entry id.
    response.assertStatus(303);
    const [row] = await rows(nowTerm);
    expect(row?.boundType).toBeNull();
    expect(row?.boundId).toBeNull();
  });
});

describe("a rejected submission", () => {
  test("hands the form back still carrying the entry it was bound to", async () => {
    const harness = await createFormsHarness([
      forms({
        forms: [
          defineForm("bound", {
            bind: "entry",
            fields: [email("email").required()],
          }),
        ],
      }),
    ]);
    await seedPageWithForm(harness, "bound");
    const token = await mint(harness);

    const response = await post(harness, token, "bound", { email: "" });

    response.assertStatus(422);
    expect(boundToken(await response.text())).toBe(token);
  });
});

describe("the signing secret", () => {
  const stored = (harness: FormsHarness) =>
    harness.db
      .select()
      .from(settings)
      .where(
        and(
          eq(settings.group, "forms_internal"),
          eq(settings.key, "bind_secret"),
        ),
      );

  test("is generated on first use and persisted, configured nowhere", async () => {
    const harness = await createFormsHarness([forms({ forms: [subscribe] })]);
    await seedPageWithForm(harness, "subscribe");
    expect(await stored(harness)).toHaveLength(0);

    const first = await mint(harness);

    const [row] = await harness.db
      .select()
      .from(settings)
      .where(
        and(
          eq(settings.group, "forms_internal"),
          eq(settings.key, "bind_secret"),
        ),
      );
    expect(row?.value).toEqual(expect.any(String));
    // The same page renders the same bytes, which is what lets the edge
    // cache one copy of it for every visitor.
    expect(await mint(harness)).toBe(first);
  });
});

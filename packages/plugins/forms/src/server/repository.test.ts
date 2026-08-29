import type { AppContext } from "plumix/plugin";
import { createTestContext } from "plumix/test";
import { describe, expect, test } from "vitest";

import type { FormsTestDb } from "../test/db.js";
import { formSubmissions } from "../db/schema.js";
import { createFormsTestDb } from "../test/db.js";
import { seedSubmissionOn } from "../test/factories.js";
import {
  countSubmissionFacets,
  countSubmissions,
  deleteSubmission,
  getSubmission,
  insertSubmission,
  listSubmissions,
  recordHandlerFailure,
  setSubmissionNote,
  setSubmissionStatus,
} from "./repository.js";

const answers = { name: "Ada" };

const SERIAL_CONFLICT =
  "SQLITE_CONSTRAINT: UNIQUE constraint failed: " +
  "form_submissions.form_slug, form_submissions.serial";

// Drizzle wraps the driver error rather than re-messaging it, so the
// constraint name is only reachable through `cause` — a flat Error would
// let a message-only predicate pass this test.
function serialConflict(): Error {
  return new Error('Failed query: insert into "form_submissions"', {
    cause: new Error(SERIAL_CONFLICT),
  });
}

function refusingInsert() {
  return {
    values: () => ({ returning: () => Promise.reject(serialConflict()) }),
  };
}

// The db comes back alongside the context because the date-range reads
// seed through the factory, which takes the db rather than the context.
async function contextWithSchema(): Promise<{
  ctx: AppContext;
  db: FormsTestDb;
}> {
  const db = await createFormsTestDb();
  return { ctx: createTestContext({ db }), db };
}

function submit(ctx: AppContext, form: string) {
  return insertSubmission(ctx, {
    form,
    status: "new",
    answers,
    labels: { name: { label: "Name" } },
    entryId: null,
    ipHash: null,
    userAgent: null,
  });
}

describe("insertSubmission", () => {
  test("numbers the first submission of a form 1", async () => {
    const { ctx } = await contextWithSchema();

    const row = await submit(ctx, "contact");

    expect(row.serial).toBe(1);
    expect(row.answers).toEqual(answers);
  });

  test("counts serials per form, not across them", async () => {
    const { ctx } = await contextWithSchema();

    await submit(ctx, "contact");
    await submit(ctx, "contact");
    const other = await submit(ctx, "newsletter");

    expect(other.serial).toBe(1);
  });

  test("gives concurrent submissions to one form distinct serials", async () => {
    const { ctx } = await contextWithSchema();

    const rows = await Promise.all(
      Array.from({ length: 8 }, () => submit(ctx, "contact")),
    );

    expect(new Set(rows.map((row) => row.serial)).size).toBe(8);
  });

  // The race the retry exists for is not reproducible against a single
  // in-memory connection, so the conflict is injected: one rejected insert
  // carrying the message SQLite raises, then the real path.
  test("retries when the unique index rejects the serial it computed", async () => {
    const { ctx } = await contextWithSchema();
    const insert = ctx.db.insert.bind(ctx.db);
    let refused = false;
    ctx.db.insert = ((table: Parameters<typeof insert>[0]) => {
      if (refused) return insert(table);
      refused = true;
      return refusingInsert() as unknown as ReturnType<typeof insert>;
    }) as typeof insert;

    const row = await submit(ctx, "contact");

    expect(refused).toBe(true);
    expect(row.serial).toBe(1);
  });

  test("gives up rather than looping when the conflict never clears", async () => {
    const { ctx } = await contextWithSchema();
    ctx.db.insert = (() => refusingInsert()) as unknown as typeof ctx.db.insert;

    await expect(submit(ctx, "contact")).rejects.toThrow(/Failed query/);
  });

  test("stores what the caller handed it", async () => {
    const { ctx } = await contextWithSchema();

    await insertSubmission(ctx, {
      form: "contact",
      status: "spam",
      answers,
      labels: { name: { label: "Name" } },
      entryId: null,
      ipHash: "deadbeef",
      userAgent: "curl/8",
    });

    const [stored] = await ctx.db.select().from(formSubmissions);
    expect(stored?.status).toBe("spam");
    expect(stored?.ipHash).toBe("deadbeef");
    expect(stored?.userAgent).toBe("curl/8");
    expect(stored?.labels).toEqual({ name: { label: "Name" } });
  });
});

describe("recordHandlerFailure", () => {
  test("records why the handler did not finish, leaving the submission as it was", async () => {
    const { ctx } = await contextWithSchema();
    const row = await submit(ctx, "contact");

    await recordHandlerFailure(ctx, row.id, "SMTP refused");

    const [stored] = await ctx.db.select().from(formSubmissions);
    expect(stored?.handlerError).toBe("SMTP refused");
    expect(stored?.answers).toEqual(answers);
    expect(stored?.status).toBe("new");
    expect(stored?.serial).toBe(row.serial);
  });
});

describe("the inbox reads", () => {
  test("lists newest first, across every form", async () => {
    const { ctx } = await contextWithSchema();
    await submit(ctx, "contact");
    await submit(ctx, "newsletter");

    const page = await listSubmissions(ctx, { limit: 10 });

    expect(page.submissions.map((row) => row.formSlug)).toEqual([
      "newsletter",
      "contact",
    ]);
    expect(page.nextCursor).toBeNull();
  });

  test("pages through with the cursor the previous page returned", async () => {
    const { ctx } = await contextWithSchema();
    for (let i = 0; i < 3; i++) await submit(ctx, "contact");

    const first = await listSubmissions(ctx, { limit: 2 });
    const second = await listSubmissions(ctx, {
      limit: 2,
      cursor: first.nextCursor,
    });

    expect(first.submissions).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    expect(second.submissions).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(second.submissions[0]?.serial).toBe(1);
  });

  test("narrows to one form and to one status", async () => {
    const { ctx } = await contextWithSchema();
    await submit(ctx, "contact");
    const spam = await insertSubmission(ctx, {
      form: "contact",
      status: "spam",
      answers,
      labels: {},
      entryId: null,
      ipHash: null,
      userAgent: null,
    });
    await submit(ctx, "newsletter");

    const byForm = await listSubmissions(ctx, { limit: 10, form: "contact" });
    const byStatus = await listSubmissions(ctx, { limit: 10, status: "spam" });

    expect(byForm.submissions).toHaveLength(2);
    expect(byStatus.submissions.map((row) => row.id)).toEqual([spam.id]);
  });

  test("counts each status within the form filter, and each form within the status filter", async () => {
    const { ctx } = await contextWithSchema();
    await submit(ctx, "contact");
    await insertSubmission(ctx, {
      form: "contact",
      status: "spam",
      answers,
      labels: {},
      entryId: null,
      ipHash: null,
      userAgent: null,
    });
    await submit(ctx, "newsletter");

    const all = await countSubmissionFacets(ctx, {});
    const contact = await countSubmissionFacets(ctx, { form: "contact" });
    const spam = await countSubmissionFacets(ctx, { status: "spam" });

    expect(all.statuses).toEqual({ new: 2, read: 0, archived: 0, spam: 1 });
    expect(all.forms).toEqual({ contact: 2, newsletter: 1 });
    expect(contact.statuses).toEqual({ new: 1, read: 0, archived: 0, spam: 1 });
    expect(spam.forms).toEqual({ contact: 1 });
  });

  test("narrows to a date range, including both of the days it names", async () => {
    const { ctx, db } = await contextWithSchema();
    await seedSubmissionOn(db, "contact", "2026-08-22");
    const monday = await seedSubmissionOn(db, "contact", "2026-08-24");
    const sunday = await seedSubmissionOn(db, "contact", "2026-08-30");
    await seedSubmissionOn(db, "contact", "2026-08-31");

    const page = await listSubmissions(ctx, {
      limit: 10,
      since: new Date("2026-08-24T00:00:00.000Z"),
      until: new Date("2026-08-30T23:59:59.999Z"),
    });

    expect(page.submissions.map((row) => row.id)).toEqual([
      sunday.id,
      monday.id,
    ]);
  });

  test("counts how many match every filter at once", async () => {
    const { ctx, db } = await contextWithSchema();
    await seedSubmissionOn(db, "contact", "2026-08-22");
    await seedSubmissionOn(db, "contact", "2026-08-24");
    await seedSubmissionOn(db, "contact", "2026-08-25");
    await seedSubmissionOn(db, "newsletter", "2026-08-25");

    const total = await countSubmissions(ctx, {
      form: "contact",
      since: new Date("2026-08-24T00:00:00.000Z"),
    });

    expect(total).toBe(2);
  });

  test("keeps the date range on both facets of the inbox counts", async () => {
    const { ctx, db } = await contextWithSchema();
    await seedSubmissionOn(db, "contact", "2026-08-22");
    await seedSubmissionOn(db, "contact", "2026-08-25");
    await seedSubmissionOn(db, "newsletter", "2026-08-25");

    const counts = await countSubmissionFacets(ctx, {
      since: new Date("2026-08-24T00:00:00.000Z"),
    });

    expect(counts.statuses.new).toBe(2);
    expect(counts.forms).toEqual({ contact: 1, newsletter: 1 });
  });
});

describe("the inbox writes", () => {
  test("reads one submission back by id, and nothing for one that never was", async () => {
    const { ctx } = await contextWithSchema();
    const row = await submit(ctx, "contact");

    expect((await getSubmission(ctx, row.id))?.answers).toEqual(answers);
    expect(await getSubmission(ctx, row.id + 1)).toBeNull();
  });

  test("moves a submission to another status", async () => {
    const { ctx } = await contextWithSchema();
    const row = await submit(ctx, "contact");

    const updated = await setSubmissionStatus(ctx, row.id, "archived");

    expect(updated?.status).toBe("archived");
    expect((await getSubmission(ctx, row.id))?.status).toBe("archived");
  });

  test("keeps a private note against a submission, and clears it", async () => {
    const { ctx } = await contextWithSchema();
    const row = await submit(ctx, "contact");

    await setSubmissionNote(ctx, row.id, "Called back on Tuesday");
    expect((await getSubmission(ctx, row.id))?.note).toBe(
      "Called back on Tuesday",
    );

    await setSubmissionNote(ctx, row.id, null);
    expect((await getSubmission(ctx, row.id))?.note).toBeNull();
  });

  test("deletes a submission, and says so when there was none to delete", async () => {
    const { ctx } = await contextWithSchema();
    const row = await submit(ctx, "contact");

    expect(await deleteSubmission(ctx, row.id)).toBe(true);
    expect(await deleteSubmission(ctx, row.id)).toBe(false);
    expect(await getSubmission(ctx, row.id)).toBeNull();
  });
});

import type { AppContext } from "plumix/plugin";
import type { TracedContext } from "plumix/test";
import {
  createTestContext,
  createTestDb,
  createTracedContext,
} from "plumix/test";
import { describe, expect, test } from "vitest";

import type { FormSubmission } from "../db/schema.js";
import type { FormsTestDb } from "../test/db.js";
import type { FormSubmissionCandidate } from "../types.js";
import type { SubmissionRowPage } from "./repository.js";
import { formLabelSnapshots, formSubmissions } from "../db/schema.js";
import { applyFormsSchema, createFormsTestDb } from "../test/db.js";
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

// The db comes back alongside the context because the date-range reads
// seed through the factory, which takes the db rather than the context.
async function contextWithSchema(): Promise<{
  ctx: AppContext;
  db: FormsTestDb;
}> {
  const db = await createFormsTestDb();
  return { ctx: createTestContext({ db }), db };
}

function submit(
  ctx: AppContext,
  form: string,
  overrides: Partial<FormSubmissionCandidate> = {},
) {
  return insertSubmission(ctx, {
    form,
    status: "new",
    answers,
    labels: { name: { label: "Name" } },
    bound: null,
    ipHash: null,
    userAgent: null,
    ...overrides,
  });
}

describe("insertSubmission", () => {
  test("stores what the caller handed it, under the row's own id", async () => {
    const { ctx } = await contextWithSchema();

    const row = await submit(ctx, "contact", {
      status: "spam",
      ipHash: "deadbeef",
      userAgent: "curl/8",
    });

    const [stored] = await ctx.db.select().from(formSubmissions);
    expect(stored?.id).toBe(row.id);
    expect(stored?.form).toBe("contact");
    expect(stored?.status).toBe("spam");
    expect(stored?.ipHash).toBe("deadbeef");
    expect(stored?.userAgent).toBe("curl/8");
    expect(stored?.answers).toEqual(answers);
  });

  test("keeps one snapshot row however many submissions share it", async () => {
    const { ctx } = await contextWithSchema();

    await submit(ctx, "contact");
    await submit(ctx, "contact");

    const snapshots = await ctx.db.select().from(formLabelSnapshots);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.labels).toEqual({ name: { label: "Name" } });
  });

  test("shares one snapshot between two forms that ask the same questions", async () => {
    const { ctx } = await contextWithSchema();

    await submit(ctx, "contact");
    await submit(ctx, "newsletter");

    const snapshots = await ctx.db.select().from(formLabelSnapshots);
    const stored = await ctx.db
      .select({ digest: formSubmissions.labelsDigest })
      .from(formSubmissions);
    expect(snapshots).toHaveLength(1);
    expect(new Set(stored.map((row) => row.digest)).size).toBe(1);
  });

  test("gives differently labelled forms snapshots of their own", async () => {
    const { ctx } = await contextWithSchema();

    await submit(ctx, "contact");
    await submit(ctx, "newsletter", {
      labels: { name: { label: "What we call you" } },
    });

    expect(await ctx.db.select().from(formLabelSnapshots)).toHaveLength(2);
  });

  // No foreign key holds the pointer, so a direct write can leave one
  // dangling. Such a row still reaches the inbox — under its raw keys,
  // which is what an empty snapshot renders as.
  test("still reads a row whose snapshot is not there", async () => {
    const { ctx, db } = await contextWithSchema();
    const [row] = await db
      .insert(formSubmissions)
      .values({
        form: "contact",
        status: "new",
        answers,
        labelsDigest: "0".repeat(64),
      })
      .returning();

    const stored = await getSubmission(ctx, row?.id ?? 0);

    expect(stored?.answers).toEqual(answers);
    expect(stored?.labels).toEqual({});
  });

  test("reads a submission back with its own labels after the form changed", async () => {
    const { ctx } = await contextWithSchema();
    const first = await submit(ctx, "contact");
    // The same form, asking a renamed question: a later submission gets a
    // snapshot of its own, and the earlier row keeps pointing at the old one.
    await submit(ctx, "contact", { labels: { name: { label: "Full name" } } });

    expect((await getSubmission(ctx, first.id))?.labels).toEqual({
      name: { label: "Name" },
    });
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
  });
});

describe("the inbox reads", () => {
  test("lists newest first, across every form", async () => {
    const { ctx } = await contextWithSchema();
    await submit(ctx, "contact");
    await submit(ctx, "newsletter");

    const page = await listSubmissions(ctx, { limit: 10 });

    expect(page.submissions.map((row) => row.form)).toEqual([
      "newsletter",
      "contact",
    ]);
    expect(page.nextCursor).toBeNull();
  });

  // Every one of these carries the same `created_at`, so it ties across
  // the page boundary and a cursor keyed on it would step over whatever
  // shares the last row's timestamp. The cursor is the `id`. Seeded to
  // one instant rather than submitted: `unixepoch()` stamps whole
  // seconds, so a real burst ties only while it misses a tick.
  test("pages through a burst of same-second arrivals, reaching every one", async () => {
    const { ctx, db } = await contextWithSchema();
    const stored: FormSubmission[] = [];
    for (let i = 0; i < 5; i++)
      stored.push(await seedSubmissionOn(db, "contact", "2026-08-24"));

    const reached: number[] = [];
    let cursor: string | null = null;
    do {
      const page: SubmissionRowPage = await listSubmissions(ctx, {
        limit: 2,
        cursor,
      });
      reached.push(...page.submissions.map((row) => row.id));
      cursor = page.nextCursor;
    } while (cursor);

    expect(reached).toEqual(stored.map((row) => row.id).reverse());
  });

  test("narrows to one form and to one status", async () => {
    const { ctx } = await contextWithSchema();
    await submit(ctx, "contact");
    const spam = await submit(ctx, "contact", { status: "spam" });
    await submit(ctx, "newsletter");

    const byForm = await listSubmissions(ctx, { limit: 10, form: "contact" });
    const byStatus = await listSubmissions(ctx, { limit: 10, status: "spam" });

    expect(byForm.submissions).toHaveLength(2);
    expect(byStatus.submissions.map((row) => row.id)).toEqual([spam.id]);
  });

  test("counts each status within the form filter, and each form within the status filter", async () => {
    const { ctx } = await contextWithSchema();
    await submit(ctx, "contact");
    await submit(ctx, "contact", { status: "spam" });
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

/**
 * How SQLite says it would answer the read `run` issues. Taken off the
 * traced span rather than off SQL the test writes out, so the plan
 * asserted below cannot drift from the query `listSubmissions` builds.
 * Only the shape of a statement decides its plan, so the bound values go
 * back purely to make the argument count up.
 */
async function planFor(
  traced: TracedContext,
  client: Awaited<ReturnType<typeof createTestDb>>["$client"],
  read: () => Promise<unknown>,
): Promise<string> {
  const before = traced.ctx.telemetry.getSpans().length;
  await traced.run(async () => {
    await read();
  });
  const [span] = traced.ctx.telemetry.getSpans().slice(before);
  const sql = span?.attributes["db.sql"];
  if (typeof sql !== "string") return "";
  const params = span?.attributes["db.params"];
  const explained = await client.execute({
    sql: `explain query plan ${sql}`,
    args: Array.isArray(params) ? params.map(String) : [],
  });
  return explained.rows
    .map((row) => row.detail)
    .filter((detail) => typeof detail === "string")
    .join(" | ");
}

describe("what the inbox's paging costs", () => {
  test("walks an index already in page order, whichever facets are set", async () => {
    // The harness takes the libsql db explicitly so its client stays in
    // reach: the plan is read through libsql's own `execute`, which binds
    // the traced values the way drizzle's raw `sql` cannot.
    const db = await createTestDb();
    const traced = await createTracedContext({ db });
    await applyFormsSchema(db);
    const page = { limit: 25 } as const;
    const plan = (read: () => Promise<unknown>) =>
      planFor(traced, db.$client, read);

    const everything = await plan(() => listSubmissions(traced.ctx, page));
    const byForm = await plan(() =>
      listSubmissions(traced.ctx, { ...page, form: "contact" }),
    );
    const byStatus = await plan(() =>
      listSubmissions(traced.ctx, { ...page, status: "new" }),
    );
    const byBoth = await plan(() =>
      listSubmissions(traced.ctx, { ...page, form: "contact", status: "new" }),
    );
    // The read every page after the first one issues, and the reason the
    // cursor is the `id`: it narrows the same index walk rather than
    // asking for a second column to break a tie.
    const cursored = await plan(() =>
      listSubmissions(traced.ctx, { ...page, form: "contact", cursor: "500" }),
    );

    // Newest-first is `id` descending and `id` is the rowid, so ordering
    // is free on every one of these — no sort, no widening.
    for (const plan of [everything, byForm, byStatus, byBoth, cursored]) {
      expect(plan).not.toMatch(/TEMP B-TREE/);
    }
    // No facet to narrow by, so this one walks the rowid itself — which
    // is already the order the page wants.
    expect(everything).toContain("SCAN form_submissions");
    expect(byForm).toContain("USING INDEX form_submissions_form_idx");
    expect(byStatus).toContain("USING INDEX form_submissions_status_idx");
    expect(byBoth).toContain("USING INDEX form_submissions_form_status_idx");
    expect(cursored).toContain("form=? AND rowid<?");
  });
});

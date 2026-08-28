import type { AppContext } from "plumix/plugin";
import { createTestContext } from "plumix/test";
import { describe, expect, test } from "vitest";

import { formSubmissions } from "../db/schema.js";
import { createFormsTestDb } from "../test/db.js";
import { insertSubmission } from "./repository.js";

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

async function contextWithSchema(): Promise<AppContext> {
  return createTestContext({ db: await createFormsTestDb() });
}

function submit(ctx: AppContext, formSlug: string) {
  return insertSubmission(ctx, {
    formSlug,
    status: "new",
    answers,
    labels: { name: { label: "Name" } },
    ipHash: null,
    userAgent: null,
  });
}

describe("insertSubmission", () => {
  test("numbers the first submission of a form 1", async () => {
    const ctx = await contextWithSchema();

    const row = await submit(ctx, "contact");

    expect(row.serial).toBe(1);
    expect(row.answers).toEqual(answers);
  });

  test("counts serials per form, not across them", async () => {
    const ctx = await contextWithSchema();

    await submit(ctx, "contact");
    await submit(ctx, "contact");
    const other = await submit(ctx, "newsletter");

    expect(other.serial).toBe(1);
  });

  test("gives concurrent submissions to one form distinct serials", async () => {
    const ctx = await contextWithSchema();

    const rows = await Promise.all(
      Array.from({ length: 8 }, () => submit(ctx, "contact")),
    );

    expect(new Set(rows.map((row) => row.serial)).size).toBe(8);
  });

  // The race the retry exists for is not reproducible against a single
  // in-memory connection, so the conflict is injected: one rejected insert
  // carrying the message SQLite raises, then the real path.
  test("retries when the unique index rejects the serial it computed", async () => {
    const ctx = await contextWithSchema();
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
    const ctx = await contextWithSchema();
    ctx.db.insert = (() => refusingInsert()) as unknown as typeof ctx.db.insert;

    await expect(submit(ctx, "contact")).rejects.toThrow(/Failed query/);
  });

  test("stores what the caller handed it", async () => {
    const ctx = await contextWithSchema();

    await insertSubmission(ctx, {
      formSlug: "contact",
      status: "spam",
      answers,
      labels: { name: { label: "Name" } },
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

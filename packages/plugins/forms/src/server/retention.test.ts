import type { AppContext } from "plumix/plugin";
import { text } from "plumix/fields";
import { HookRegistry, installPlugins } from "plumix/plugin";
import { createTestContext } from "plumix/test";
import { describe, expect, test } from "vitest";

import { defineForm } from "../define-form.js";
import { forms } from "../index.js";
import { createFormsTestDb } from "../test/db.js";
import { submissionFactory } from "../test/factories.js";
import { listAllSubmissions } from "./repository.js";
import { purgeExpiredSubmissions, RETENTION_CRON } from "./retention.js";

const NOW = new Date("2026-06-01T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY);
}

// The db is kept beside the context rather than read back off it: the
// factory seeds through the same handle the purge then reads.
async function context(): Promise<{
  readonly ctx: AppContext;
  readonly seed: (form: string, createdAt: Date) => Promise<unknown>;
}> {
  const db = await createFormsTestDb();
  return {
    ctx: createTestContext({ db }),
    seed: (form, createdAt) =>
      submissionFactory.transient({ db }).create({ form, createdAt }),
  };
}

describe("purgeExpiredSubmissions", () => {
  test("removes what a form has kept past its retention period", async () => {
    const { ctx, seed } = await context();
    const contact = defineForm("contact", {
      fields: [text("name")],
      retentionDays: 30,
    });
    await seed("contact", daysAgo(31));
    await seed("contact", daysAgo(29));

    const deleted = await purgeExpiredSubmissions(ctx, [contact], NOW);

    expect(deleted).toBe(1);
    const left = await listAllSubmissions(ctx, {}, 100);
    expect(left.map((row) => row.createdAt)).toEqual([daysAgo(29)]);
  });

  test("keeps a form's submissions forever when its retention is zero", async () => {
    const { ctx, seed } = await context();
    const forever = defineForm("contact", {
      fields: [text("name")],
      retentionDays: 0,
    });
    await seed("contact", daysAgo(4000));

    const deleted = await purgeExpiredSubmissions(ctx, [forever], NOW);

    expect(deleted).toBe(0);
    expect(await listAllSubmissions(ctx, {}, 100)).toHaveLength(1);
  });

  test("leaves a form nobody declares any more alone", async () => {
    const { ctx, seed } = await context();
    const contact = defineForm("contact", {
      fields: [text("name")],
      retentionDays: 30,
    });
    await seed("retired", daysAgo(4000));

    expect(await purgeExpiredSubmissions(ctx, [contact], NOW)).toBe(0);
    expect(await listAllSubmissions(ctx, {}, 100)).toHaveLength(1);
  });
});

describe("the nightly purge the plugin registers", () => {
  test("runs one task on the nightly cron, whatever the forms declare", async () => {
    const { registry } = await installPlugins({
      hooks: new HookRegistry(),
      plugins: [forms()],
    });

    expect(registry.scheduledTasks.map((task) => [task.id, task.cron])).toEqual(
      [["retention-purge", RETENTION_CRON]],
    );
  });

  test("purges the forms the site declares when it fires", async () => {
    const { ctx, seed } = await context();
    const { registry } = await installPlugins({
      hooks: new HookRegistry(),
      plugins: [
        forms({
          forms: [
            defineForm("contact", {
              fields: [text("name")],
              retentionDays: 30,
            }),
          ],
        }),
      ],
    });
    await seed("contact", daysAgo(31));

    await registry.scheduledTasks[0]?.handler(ctx);

    expect(await listAllSubmissions(ctx, {}, 100)).toHaveLength(0);
  });
});

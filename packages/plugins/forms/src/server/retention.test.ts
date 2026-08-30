import type { AppContext } from "plumix/plugin";
import { text } from "plumix/fields";
import { HookRegistry, installPlugins } from "plumix/plugin";
import { createTestContext } from "plumix/test";
import { describe, expect, test } from "vitest";

import type { FormDefinition } from "../define-form.js";
import type { FormRegistry } from "../registry.js";
import { defineForm } from "../define-form.js";
import { FormsError } from "../errors.js";
import { forms } from "../index.js";
import { createFormRegistry } from "../registry.js";
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

function registryOf(
  declared: readonly FormDefinition[],
  defaultRetentionDays?: number,
): FormRegistry {
  const registry = createFormRegistry(defaultRetentionDays);
  for (const form of declared) registry.register(form, "config");
  return registry;
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

    const deleted = await purgeExpiredSubmissions(
      ctx,
      registryOf([contact]),
      NOW,
    );

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

    const deleted = await purgeExpiredSubmissions(
      ctx,
      registryOf([forever]),
      NOW,
    );

    expect(deleted).toBe(0);
    expect(await listAllSubmissions(ctx, {}, 100)).toHaveLength(1);
  });

  test("takes a form's whole backlog when all of it has expired", async () => {
    const { ctx, seed } = await context();
    const contact = defineForm("contact", {
      fields: [text("name")],
      retentionDays: 30,
    });
    await seed("contact", daysAgo(90));
    await seed("contact", daysAgo(60));
    await seed("contact", daysAgo(31));

    expect(await purgeExpiredSubmissions(ctx, registryOf([contact]), NOW)).toBe(
      3,
    );
    expect(await listAllSubmissions(ctx, {}, 100)).toHaveLength(0);
  });

  test("purges each form against its own period, in one pass", async () => {
    const { ctx, seed } = await context();
    const week = defineForm("contact", {
      fields: [text("name")],
      retentionDays: 7,
    });
    const year = defineForm("survey", {
      fields: [text("name")],
      retentionDays: 365,
    });
    await seed("contact", daysAgo(400));
    await seed("survey", daysAgo(400));
    await seed("contact", daysAgo(8));
    await seed("survey", daysAgo(8));

    expect(
      await purgeExpiredSubmissions(ctx, registryOf([week, year]), NOW),
    ).toBe(3);
    const left = await listAllSubmissions(ctx, {}, 100);
    expect(left.map((row) => row.form)).toEqual(["survey"]);
  });

  test("leaves a form with nothing stored alone", async () => {
    const { ctx } = await context();
    const contact = defineForm("contact", {
      fields: [text("name")],
      retentionDays: 30,
    });

    expect(await purgeExpiredSubmissions(ctx, registryOf([contact]), NOW)).toBe(
      0,
    );
  });

  test("holds a backdated row until every row stored before it has gone", async () => {
    const { ctx, seed } = await context();
    const contact = defineForm("contact", {
      fields: [text("name")],
      retentionDays: 30,
    });
    await seed("contact", daysAgo(29));
    await seed("contact", daysAgo(400));

    expect(await purgeExpiredSubmissions(ctx, registryOf([contact]), NOW)).toBe(
      0,
    );
    expect(await listAllSubmissions(ctx, {}, 100)).toHaveLength(2);

    // A month on, the row stored before it has expired too, and both go.
    const later = new Date(NOW.getTime() + 30 * DAY);
    expect(
      await purgeExpiredSubmissions(ctx, registryOf([contact]), later),
    ).toBe(2);
    expect(await listAllSubmissions(ctx, {}, 100)).toHaveLength(0);
  });

  test("leaves a form nobody declares any more alone", async () => {
    const { ctx, seed } = await context();
    const contact = defineForm("contact", {
      fields: [text("name")],
      retentionDays: 30,
    });
    await seed("retired", daysAgo(4000));

    expect(await purgeExpiredSubmissions(ctx, registryOf([contact]), NOW)).toBe(
      0,
    );
    expect(await listAllSubmissions(ctx, {}, 100)).toHaveLength(1);
  });
});

describe("a site-wide retention period", () => {
  test("is what a form declaring none of its own is kept for", async () => {
    const { ctx, seed } = await context();
    const contact = defineForm("contact", { fields: [text("name")] });
    await seed("contact", daysAgo(31));
    await seed("contact", daysAgo(29));

    const registry = registryOf([contact], 30);

    expect(await purgeExpiredSubmissions(ctx, registry, NOW)).toBe(1);
  });

  test("gives way to the period a form declares for itself", async () => {
    const { ctx, seed } = await context();
    const kept = defineForm("contact", {
      fields: [text("name")],
      retentionDays: 365,
    });
    await seed("contact", daysAgo(31));

    const registry = registryOf([kept], 30);

    expect(await purgeExpiredSubmissions(ctx, registry, NOW)).toBe(0);
  });

  test("is opted out of by a form declaring zero", async () => {
    const { ctx, seed } = await context();
    const forever = defineForm("contact", {
      fields: [text("name")],
      retentionDays: 0,
    });
    await seed("contact", daysAgo(4000));

    const registry = registryOf([forever], 30);

    expect(await purgeExpiredSubmissions(ctx, registry, NOW)).toBe(0);
  });

  test("is nothing at all when the site sets none", async () => {
    const { ctx, seed } = await context();
    const contact = defineForm("contact", { fields: [text("name")] });
    await seed("contact", daysAgo(4000));

    const registry = registryOf([contact]);

    expect(await purgeExpiredSubmissions(ctx, registry, NOW)).toBe(0);
  });

  test("is refused at config time when it is not a whole number of days", () => {
    expect(() => forms({ retentionDays: -1 })).toThrow(FormsError);
    expect(() => forms({ retentionDays: 1.5 })).toThrow(FormsError);
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

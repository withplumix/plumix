import { text } from "plumix/fields";
import { testSite } from "plumix/test";
import { describe, expect, test } from "vitest";

import { defineForm } from "../../src/define-form.js";
import { forms } from "../../src/index.js";
import { listAllSubmissions } from "../../src/server/repository.js";
import { RETENTION_CRON } from "../../src/server/retention.js";
import { submissionFactory } from "../../src/test/factories.js";

const DAY = 24 * 60 * 60 * 1000;

const site = await testSite({
  plugins: [
    forms({
      forms: [
        defineForm("contact", { fields: [text("name")], retentionDays: 30 }),
      ],
    }),
  ],
  factories: { submission: submissionFactory },
});

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY);
}

describe("the nightly purge", () => {
  test("is scheduled on the nightly cron", () => {
    site.schedule.assertScheduled("forms:retention-purge", RETENTION_CRON);
  });

  test("deletes the submissions a form has kept past its retention period", async () => {
    await site.factory.submission.create({
      form: "contact",
      createdAt: daysAgo(31),
    });
    const kept = await site.factory.submission.create({
      form: "contact",
      createdAt: daysAgo(29),
    });

    (await site.runTask("forms:retention-purge")).assertRan(
      "forms:retention-purge",
    );

    const remaining = await listAllSubmissions(site.context, {}, 100);
    expect(remaining.map((row) => row.id)).toEqual([kept.id]);
  });
});

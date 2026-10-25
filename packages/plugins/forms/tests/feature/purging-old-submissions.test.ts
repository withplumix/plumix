import { text } from "plumix/fields";
import { testSite } from "plumix/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { defineForm } from "../../src/define-form.js";
import { forms } from "../../src/index.js";
import { listAllSubmissions } from "../../src/server/repository.js";
import { submissionFactory } from "../../src/test/factories.js";

const NOW = new Date("2026-06-01T00:00:00.000Z");
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
  return new Date(NOW.getTime() - days * DAY);
}

describe("the nightly purge", () => {
  // Only `Date` is faked: the database still needs its timers.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("is scheduled on the nightly cron", () => {
    site.schedule.assertScheduled("forms:retention-purge", "0 3 * * *");
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

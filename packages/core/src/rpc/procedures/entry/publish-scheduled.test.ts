import { describe, expect, test } from "vitest";

import { requestStore } from "../../../context/stores.js";
import { sql } from "../../../db/index.js";
import { definePlugin } from "../../../plugin/define.js";
import { testSite } from "../../../test/site.js";
import { publishDueScheduledEntries } from "./publish-scheduled.js";

const posts = definePlugin("posts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  },
});

const site = await testSite({ plugins: [posts] });

/**
 * The plan of the statement a run finds due entries with, planned with the
 * params it was bound to, so the plan is the one the site's database runs.
 */
async function dueEntriesPlan(): Promise<string[]> {
  const context = site.context;
  await requestStore.run(context, async () => {
    await publishDueScheduledEntries(context);
  });
  const [statement] = context.telemetry
    .getSpans()
    .filter((span) => span.name.startsWith("db:"))
    .map((span) => ({
      text: span.attributes["db.sql"] as string,
      params: (span.attributes["db.params"] ?? []) as unknown[],
    }))
    .filter(({ text }) => text.includes('"entries"."status" = ?'));
  if (statement === undefined) throw new Error("the run selected nothing");
  const pieces = statement.text.split("?");
  const bound = sql.join(
    pieces.map((piece, i) =>
      i < statement.params.length
        ? sql`${sql.raw(piece)}${statement.params[i]}`
        : sql.raw(piece),
    ),
  );
  const plan = await context.db.all<{ detail: string }>(
    sql`EXPLAIN QUERY PLAN ${bound}`,
  );
  return plan.map((step) => step.detail);
}

describe("publishDueScheduledEntries", () => {
  test("finds due entries through the status index without scanning entries", async () => {
    const plan = await dueEntriesPlan();

    expect(plan).toEqual([
      expect.stringContaining("USING INDEX entries_status_published_idx"),
    ]);
    expect(plan.join("\n")).not.toContain("SCAN entries");
  });
});

import { describe, expect, test } from "vitest";

import { entry } from "../../../hooks/entry.js";
import { definePlugin } from "../../../plugin/define.js";
import { testSite } from "../../../test/site.js";
import {
  applyEntryBeforeSave,
  fireEntryPublished,
  fireEntryTransition,
} from "./lifecycle.js";

/** Each handler's run, in order: its scope, then the entry's slug. */
const trail: string[] = [];

const landingPages = definePlugin("landing", {
  setup: (ctx) => {
    ctx.registerEntryType("landing_page", { label: "Landing pages" });
    ctx.filters.add(entry.for("landing_page").beforeSave, (row) => {
      trail.push(`specific:${row.slug}`);
      return { ...row, title: `[specific] ${row.title}` };
    });
    ctx.filters.add(entry.beforeSave, (row) => {
      trail.push(`generic:${row.slug}`);
      return { ...row, title: `[generic] ${row.title}` };
    });
    ctx.events.on(entry.for("landing_page").published, ({ entry }) => {
      trail.push(`specific:${entry.slug}`);
    });
    ctx.events.on(entry.published, ({ entry }) => {
      trail.push(`generic:${entry.slug}`);
    });
  },
});

const site = await testSite({ plugins: [landingPages] });

function trailFor(slug: string): string[] {
  return trail.filter((run) => run.endsWith(`:${slug}`));
}

describe("lifecycle — scoped and unscoped event fan-out", () => {
  test("a type-scoped beforeSave runs before the unscoped one on save", async () => {
    const admin = await site.factory.admin.create();

    const result = await applyEntryBeforeSave(site.context, "landing_page", {
      type: "landing_page",
      title: "raw",
      slug: "raw",
      authorId: admin.id,
      status: "draft",
    });

    expect(trailFor("raw")).toEqual(["specific:raw", "generic:raw"]);
    expect(result.title).toBe("[generic] [specific] raw");
  });

  test("fireEntryPublished runs both scoped and unscoped handlers", async () => {
    const row = await site.factory.published.create({
      type: "landing_page",
      slug: "specific-and-generic",
    });

    await fireEntryPublished(site.context, row);

    expect(trailFor("specific-and-generic").sort()).toEqual([
      "generic:specific-and-generic",
      "specific:specific-and-generic",
    ]);
  });

  test("fireEntryTransition is a no-op when new === old status", async () => {
    const draft = await site.factory.draft.create({ slug: "same-status" });

    await fireEntryTransition(site.context, draft, "draft");

    site.events.assertNotEmitted(entry.transition);
  });

  test("fireEntryTransition emits when the status changed", async () => {
    const draft = await site.factory.draft.create({ slug: "new-status" });

    await fireEntryTransition(
      site.context,
      { ...draft, status: "published" },
      "draft",
    );

    expect(site.events.emitted(entry.transition)).toHaveLength(1);
  });
});

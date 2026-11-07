import { describe, expect, test } from "vitest";

import { and, eq } from "../../src/db/index.js";
import { settings } from "../../src/db/schema/settings.js";
import { definePlugin } from "../../src/plugin/define.js";
import { number, text } from "../../src/plugin/fields/index.js";
import { testSite } from "../../src/test/site.js";

const readingSettings = definePlugin("reading", {
  setup: (ctx) => {
    ctx.registerSettingsGroup("reading", {
      label: "Reading",
      fields: [
        number("per_page").min(1).max(50),
        text("blurb").maxLength(5),
        text("motto").required(),
      ],
    });
  },
});

const site = await testSite({ plugins: [readingSettings] });

/** Saves from the group as it stands, the way a settings card does. */
async function saveCurrent(values: Record<string, unknown>) {
  const admin = site.actingAs("admin");
  const { etag } = await admin.rpc.settings.get({ group: "reading" });
  const saved = await admin.rpc.settings.upsert({
    group: "reading",
    values,
    ifMatch: etag,
  });
  return saved.values;
}

// Registered fields decode a value to their declared shape, whatever the
// caller's spelling, which is what lets `settings.value` name what it holds.
describe("saving a settings group with typed fields", () => {
  test("stores a registered field's value in its declared shape", async () => {
    const values = await saveCurrent({ per_page: "10" });

    expect(values).toEqual({ per_page: 10 });
    const [row] = await site.context.db
      .select({ value: settings.value })
      .from(settings)
      .where(and(eq(settings.group, "reading"), eq(settings.key, "per_page")));
    expect(row?.value).toBe(10);
  });

  test("rejects the whole write when a value doesn't fit its field", async () => {
    await expect(
      saveCurrent({ per_page: "not a number", blurb: "ok" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: {
        reason: "settings_invalid_value",
        errors: [{ path: "per_page" }],
      },
    });
    // Nothing partial lands: the sibling key is untouched too.
    expect(
      (await site.actingAs("admin").rpc.settings.get({ group: "reading" }))
        .values,
    ).toEqual({});
  });

  test("enforces a declared constraint, not just the shape", async () => {
    await expect(saveCurrent({ blurb: "far too long" })).rejects.toMatchObject({
      code: "CONFLICT",
      data: {
        reason: "settings_invalid_value",
        errors: [{ path: "blurb" }],
      },
    });
  });

  test("refuses to clear a required field, as meta does", async () => {
    await expect(saveCurrent({ motto: null })).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "settings_invalid_value", errors: [{ path: "motto" }] },
    });
  });

  test("stores whatever JSON an unregistered key was sent", async () => {
    const values = await saveCurrent({ orphan: { nested: [1, true, null] } });

    expect(values).toEqual({ orphan: { nested: [1, true, null] } });
  });

  // A function never crosses the wire, but a bigint does, and JSON has none.
  test("rejects a value with no JSON serialization", async () => {
    await expect(saveCurrent({ orphan: 1n })).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "settings_invalid_value", key: "reading.orphan" },
    });
  });
});

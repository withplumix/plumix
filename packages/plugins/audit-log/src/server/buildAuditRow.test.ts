import { describe, expect, test } from "vitest";

import { buildAuditRow } from "./buildAuditRow.js";

describe("buildAuditRow", () => {
  test("denormalizes actor and subject fields onto the row", () => {
    const row = buildAuditRow({
      event: "entry:published",
      actor: { id: 7, label: "alice@example.com" },
      subject: { type: "entry", id: "42", label: "Hello world" },
    });

    expect(row).toMatchObject({
      event: "entry:published",
      subjectType: "entry",
      subjectId: "42",
      subjectLabel: "Hello world",
      actorId: 7,
      actorLabel: "alice@example.com",
    });
  });

  test("emits a diff envelope only for fields that changed", () => {
    const row = buildAuditRow({
      event: "entry:updated",
      actor: { id: 1, label: "a" },
      subject: { type: "entry", id: "1", label: "Post" },
      previous: { title: "Old", slug: "p", status: "draft" },
      next: { title: "New", slug: "p", status: "draft" },
    });

    expect(row.properties).toEqual({
      diff: { title: ["Old", "New"] },
    });
  });

  test("treats missing keys on either side as null", () => {
    // Adding a brand-new column on next: appears as [null, value].
    const row = buildAuditRow({
      event: "entry:updated",
      actor: { id: 1, label: "a" },
      subject: { type: "entry", id: "1", label: "Post" },
      previous: { title: "T" },
      next: { title: "T", excerpt: "summary" },
    });

    expect(row.properties).toEqual({
      diff: { excerpt: [null, "summary"] },
    });
  });

  test("treats Date instances as equal when their .getTime() matches", () => {
    // Drizzle reads timestamp columns as Date — same epoch, distinct
    // instances. Without the Date special-case, JSON.stringify would
    // emit identical strings (both ISO), so the equality holds — but
    // the explicit branch keeps the contract obvious.
    const row = buildAuditRow({
      event: "entry:updated",
      actor: { id: 1, label: "a" },
      subject: { type: "entry", id: "1", label: "Post" },
      previous: { publishedAt: new Date("2026-01-01T00:00:00Z") },
      next: { publishedAt: new Date("2026-01-01T00:00:00Z") },
    });

    expect(row.properties).not.toHaveProperty("diff");
  });

  test("omits the diff envelope when previous or next is missing", () => {
    // Lifecycle events that don't carry a before/after pair (publish,
    // trash) shouldn't have a `diff` key at all.
    const row = buildAuditRow({
      event: "entry:published",
      actor: { id: 1, label: "a" },
      subject: { type: "entry", id: "1", label: "Post" },
    });

    expect(row.properties).toEqual({});
  });

  test("merges extraProperties without clobbering the diff", () => {
    const row = buildAuditRow({
      event: "entry:transition",
      actor: { id: 1, label: "a" },
      subject: { type: "entry", id: "1", label: "Post" },
      extraProperties: { status: { from: "draft", to: "published" } },
    });

    expect(row.properties).toEqual({
      status: { from: "draft", to: "published" },
    });
  });

  test("anonymous actor lands as null id + null label", () => {
    const row = buildAuditRow({
      event: "entry:trashed",
      actor: { id: null, label: null },
      subject: { type: "entry", id: "1", label: "Post" },
    });

    expect(row.actorId).toBeNull();
    expect(row.actorLabel).toBeNull();
  });
});

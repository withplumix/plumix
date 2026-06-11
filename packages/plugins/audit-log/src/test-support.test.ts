import { describe, expect, test } from "vitest";

import { auditLogFactory, createDb } from "./test-support.js";

describe("auditLogFactory", () => {
  test("inserts a row with defaults and honours overrides", async () => {
    const db = await createDb();
    const occurredAt = new Date("2026-05-11T00:00:00Z");

    const row = await auditLogFactory
      .transient({ db })
      .create({ event: "entry:published", occurredAt });

    expect(row.id).toBeGreaterThan(0);
    expect(row.event).toBe("entry:published");
    expect(row.subjectType).toBe("entry");
    expect(row.actorLabel).toBe("alice@example.com");
    expect(row.occurredAt.getTime()).toBe(occurredAt.getTime());
  });

  test("createList seeds N rows", async () => {
    const db = await createDb();
    const rows = await auditLogFactory.transient({ db }).createList(5);
    expect(rows).toHaveLength(5);
  });
});

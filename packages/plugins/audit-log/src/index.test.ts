import type { PlumixApp } from "plumix";
import { sqliteTable } from "drizzle-orm/sqlite-core";
import { createDispatcherHarness, generateSchemaSource } from "plumix/test";
import { beforeAll, describe, expect, test } from "vitest";

import type { AuditLogStorage } from "./types.js";
import { auditLog as auditLogTable } from "./db/schema.js";
import { auditLog } from "./index.js";

const DEFAULT_EXPORT = 'export * from "@plumix/plugin-audit-log/schema";';

let app: PlumixApp;
beforeAll(async () => {
  ({ app } = await createDispatcherHarness({ plugins: [auditLog()] }));
});

function emittedSchema(storage?: AuditLogStorage): string {
  return generateSchemaSource({
    ...app.config,
    plugins: [auditLog({ storage })],
  }).source;
}

function sink(schema?: AuditLogStorage["schema"]): AuditLogStorage {
  return {
    kind: "sink",
    schema,
    write: () => Promise.resolve(),
    query: () => Promise.resolve({ rows: [], nextCursor: null }),
  };
}

describe("auditLog() — plumix migrate generate", () => {
  test("emits a custom storage's own schema in place of the default", () => {
    const source = emittedSchema(
      sink({ module: {}, specifier: "@example/audit-sink/schema" }),
    );

    expect(source).toContain('export * from "@example/audit-sink/schema";');
    expect(source).not.toContain(DEFAULT_EXPORT);
  });

  test("binds a custom storage's own tables for runtime queries", async () => {
    const events = sqliteTable("audit_events", (t) => ({ id: t.integer() }));
    const { app: custom } = await createDispatcherHarness({
      plugins: [
        auditLog({
          storage: sink({
            module: { events },
            specifier: "@example/audit-sink/schema",
          }),
        }),
      ],
    });

    expect(custom.schema.events).toBe(events);
    expect(custom.schema.auditLog).toBeUndefined();
  });

  test("a storage with no tables contributes no schema module", () => {
    const source = emittedSchema(sink());

    expect(source).toContain('export * from "plumix/schema";');
    expect(source.match(/^export \* from /gm)).toHaveLength(1);
  });

  test("the default sqlite() storage emits and binds the audit_log table", () => {
    expect(emittedSchema()).toContain(DEFAULT_EXPORT);
    expect(app.schema.auditLog).toBe(auditLogTable);
  });
});

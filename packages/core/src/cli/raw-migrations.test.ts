import { describe, expect, test } from "vitest";

import type { PluginDescriptor, RawSqlMigration } from "../plugin/define.js";
import type {
  MigrationJournal,
  PluginRawSqlMigration,
} from "./raw-migrations.js";
import { definePlugin } from "../plugin/define.js";
import {
  collectRawSqlMigrations,
  planRawSqlMigrations,
} from "./raw-migrations.js";

function pluginWith(
  id: string,
  sqlMigrations: readonly RawSqlMigration[],
): PluginDescriptor {
  return { id, setup: () => undefined, sqlMigrations };
}

describe("collectRawSqlMigrations", () => {
  test("flattens each plugin's declarations in config order", () => {
    const declared = collectRawSqlMigrations([
      pluginWith("search", [
        { name: "fts_index", statements: ["CREATE VIRTUAL TABLE a"] },
        { name: "fts_triggers", statements: ["CREATE TRIGGER b"] },
      ]),
      pluginWith("audit", [
        { name: "audit_trigger", statements: ["CREATE TRIGGER c"] },
      ]),
    ]);

    expect([...declared]).toEqual([
      {
        pluginId: "search",
        name: "fts_index",
        statements: ["CREATE VIRTUAL TABLE a"],
      },
      {
        pluginId: "search",
        name: "fts_triggers",
        statements: ["CREATE TRIGGER b"],
      },
      {
        pluginId: "audit",
        name: "audit_trigger",
        statements: ["CREATE TRIGGER c"],
      },
    ]);
  });

  test("reads the declarations definePlugin carries through", () => {
    const declared = collectRawSqlMigrations([
      definePlugin("search", {
        setup: () => undefined,
        sqlMigrations: [
          { name: "fts_index", statements: ["CREATE VIRTUAL TABLE a"] },
        ],
      }),
    ]);

    expect(declared.map((m) => m.name)).toEqual(["fts_index"]);
  });

  test("rejects a name that cannot be part of a migration filename", () => {
    expect(() =>
      collectRawSqlMigrations([
        pluginWith("search", [
          { name: "fts index", statements: ["CREATE VIRTUAL TABLE a"] },
        ]),
      ]),
    ).toThrow(
      expect.objectContaining({ code: "raw_sql_migration_invalid_name" }),
    );
  });

  test("rejects two declarations that share one identity", () => {
    expect(() =>
      collectRawSqlMigrations([
        pluginWith("search", [
          { name: "fts_index", statements: ["CREATE VIRTUAL TABLE a"] },
          { name: "fts_index", statements: ["CREATE VIRTUAL TABLE b"] },
        ]),
      ]),
    ).toThrow(
      expect.objectContaining({
        code: "raw_sql_migration_duplicate",
        message: expect.stringContaining("search_fts_index") as unknown,
      }),
    );
  });
});

function journalWith(...tags: readonly string[]): MigrationJournal {
  return {
    version: "7",
    dialect: "sqlite",
    entries: tags.map((tag, idx) => ({
      idx,
      version: "6",
      when: 1_000 + idx,
      tag,
      breakpoints: true,
    })),
  };
}

const FTS: readonly PluginRawSqlMigration[] = [
  {
    pluginId: "search",
    name: "fts_index",
    statements: ["CREATE VIRTUAL TABLE a"],
  },
];

describe("planRawSqlMigrations", () => {
  test("numbers each migration from the journal's last index", () => {
    const plan = planRawSqlMigrations(
      [
        ...FTS,
        {
          pluginId: "search",
          name: "fts_triggers",
          statements: ["CREATE TRIGGER b"],
        },
      ],
      journalWith("0000_plain_phil_sheldon"),
      5_000,
    );

    expect(plan.emit.map((m) => m.tag)).toEqual([
      "0001_plumix_search_fts_index",
      "0002_plumix_search_fts_triggers",
    ]);
    expect(plan.journal.entries).toEqual([
      {
        idx: 0,
        version: "6",
        when: 1_000,
        tag: "0000_plain_phil_sheldon",
        breakpoints: true,
      },
      {
        idx: 1,
        version: "6",
        when: 5_000,
        tag: "0001_plumix_search_fts_index",
        breakpoints: true,
      },
      {
        idx: 2,
        version: "6",
        when: 5_001,
        tag: "0002_plumix_search_fts_triggers",
        breakpoints: true,
      },
    ]);
  });

  test("joins statements with drizzle's breakpoint marker, each terminated", () => {
    const plan = planRawSqlMigrations(
      [
        {
          pluginId: "search",
          name: "fts_index",
          statements: [
            "CREATE VIRTUAL TABLE a USING fts5(body)",
            "CREATE TRIGGER b AFTER INSERT ON a BEGIN SELECT 1; END;",
          ],
        },
      ],
      journalWith("0000_plain_phil_sheldon"),
      5_000,
    );

    expect(plan.emit[0]?.sql).toBe(
      "CREATE VIRTUAL TABLE a USING fts5(body);\n" +
        "--> statement-breakpoint\n" +
        "CREATE TRIGGER b AFTER INSERT ON a BEGIN SELECT 1; END;\n",
    );
  });

  test("moves a trailing END onto its own line", () => {
    const plan = planRawSqlMigrations(
      [
        {
          pluginId: "search",
          name: "fts_triggers",
          statements: [
            "CREATE TRIGGER b AFTER INSERT ON a BEGIN\n  INSERT INTO f(rowid) VALUES (new.id);END",
          ],
        },
      ],
      journalWith("0000_plain_phil_sheldon"),
      5_000,
    );

    expect(plan.emit[0]?.sql).toBe(
      "CREATE TRIGGER b AFTER INSERT ON a BEGIN\n" +
        "  INSERT INTO f(rowid) VALUES (new.id);\n" +
        "END;\n",
    );
  });

  test("drops a blank statement rather than emitting a bare semicolon", () => {
    const plan = planRawSqlMigrations(
      [
        {
          pluginId: "search",
          name: "fts_index",
          statements: ["CREATE VIRTUAL TABLE a", "  "],
        },
      ],
      journalWith("0000_plain_phil_sheldon"),
      5_000,
    );

    expect(plan.emit[0]?.sql).toBe("CREATE VIRTUAL TABLE a;\n");
  });

  test("skips a migration the journal already carries and numbers past it", () => {
    const plan = planRawSqlMigrations(
      [
        ...FTS,
        {
          pluginId: "search",
          name: "fts_triggers",
          statements: ["CREATE TRIGGER b"],
        },
      ],
      journalWith(
        "0000_plain_phil_sheldon",
        "0001_plumix_search_fts_index",
        "0002_wide_bloodaxe",
      ),
      5_000,
    );

    expect(plan.emit.map((m) => m.tag)).toEqual([
      "0003_plumix_search_fts_triggers",
    ]);
  });

  test("leaves the journal untouched when nothing is declared", () => {
    const journal = journalWith("0000_plain_phil_sheldon");

    const plan = planRawSqlMigrations([], journal, 5_000);

    expect(plan.emit).toEqual([]);
    expect(plan.journal.entries).toEqual(journal.entries);
  });

  test("stamps a migration later than the journal's last entry", () => {
    const journal = journalWith("0000_plain_phil_sheldon");

    const plan = planRawSqlMigrations([...FTS], journal, 0);

    expect(plan.journal.entries.at(-1)?.when).toBe(1_001);
  });
});

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { CommandContext, PlumixApp, RuntimeSync } from "@plumix/core";
import type { DispatcherHarness, MemorySyncEnd } from "@plumix/core/test";
import {
  definePlugin,
  defineTemplate,
  defineTheme,
  fallback,
} from "@plumix/core";
import { CORE_SYNC_SCOPE_TABLES } from "@plumix/core/cli";
import { number, text } from "@plumix/core/fields";
import {
  createDispatcherHarness,
  createTestContext,
  createTestDb,
  memorySync,
  memorySyncEnds,
} from "@plumix/core/test";

import { resolveOwners } from "../migrate/owners.js";
import { report } from "../report.js";
import { writeDump } from "../sync/dump.js";
import { importCommand } from "./import.js";
import { syncDeps } from "./sync.js";

const blog = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.registerTermTaxonomy("topic", {
      label: "Topics",
      entryTypes: ["post"],
    });
    ctx.registerEntryType("page", { label: "Pages", isPublic: true });
    ctx.registerEntryMetaBox("review", {
      label: "Review",
      entryTypes: ["post"],
      fields: [number("rating")],
    });
    ctx.registerEntryMetaBox("summary", {
      label: "Summary",
      entryTypes: ["page"],
      fields: [text("summary").required()],
    });
  },
});

/** Renders an entry's title and the names of its terms. */
const termsTheme = defineTheme({
  templates: [
    fallback(
      defineTemplate({
        render: ({ data }) =>
          "entry" in data ? (
            <main>
              {`${data.entry.title}: ${data.entry.terms.map((t) => t.name).join(", ")}`}
            </main>
          ) : null,
      }),
    ),
  ],
});

let dir: string;
let lines: string[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "plumix-import-"));
  lines = [];
  for (const method of ["info", "success", "hint"] as const) {
    vi.spyOn(report, method).mockImplementation((line: string) => {
      lines.push(line);
    });
  }
  vi.spyOn(syncDeps, "isInteractive").mockReturnValue(false);
  vi.spyOn(syncDeps, "now").mockReturnValue(
    new Date("2026-10-15T09:30:00.000Z"),
  );
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

interface Site {
  readonly harness: DispatcherHarness;
  readonly client: MemorySyncEnd["client"];
  readonly remote: MemorySyncEnd;
  readonly sync: RuntimeSync;
}

/** A blog site whose database is the local end of a memory sync. */
async function blogSite(): Promise<Site> {
  const db = await createTestDb();
  const harness = await createDispatcherHarness({
    db,
    config: { plugins: [blog], theme: termsTheme },
  });
  const { remote } = await memorySyncEnds();
  const local = {
    client: db.$client,
    ctx: createTestContext({
      db,
      hooks: harness.app.hooks,
      plugins: harness.app.plugins,
    }),
  };
  return {
    harness,
    client: db.$client,
    remote,
    sync: memorySync({ local, remote }),
  };
}

function importCtx(
  argv: readonly string[],
  sync: RuntimeSync,
  app: PlumixApp,
): CommandContext<PlumixApp> {
  return {
    app,
    cwd: dir,
    configPath: join(dir, "plumix.config.ts"),
    argv,
    runtimeSync: sync,
  };
}

function writeRecords(name: string, records: readonly unknown[]): string {
  const path = join(dir, name);
  writeFileSync(
    path,
    records.map((record) => `${JSON.stringify(record)}\n`).join(""),
  );
  return path;
}

describe("plumix import, authoring records", () => {
  test("1,000 records with terms import into an empty site, and the entries render with their terms", async () => {
    const site = await blogSite();
    const topics = Array.from({ length: 10 }, (_, i) => ({
      type: "term",
      taxonomy: "topic",
      slug: `topic-${String(i)}`,
      name: `Topic ${String(i)}`,
    }));
    const posts = Array.from({ length: 990 }, (_, i) => ({
      type: "entry",
      entryType: "post",
      slug: `post-${String(i)}`,
      title: `Post ${String(i)}`,
      author: `writer-${String(i % 3)}@example.com`,
      content: { blocks: [] },
      terms: [
        { taxonomy: "topic", slug: `topic-${String(i % 10)}` },
        { taxonomy: "topic", slug: `topic-${String((i + 1) % 10)}` },
      ],
    }));
    const file = writeRecords("content.jsonl", [...topics, ...posts]);

    await importCommand.run(importCtx([file], site.sync, site.harness.app));

    expect(
      await site.client.execute(
        "SELECT (SELECT count(*) FROM entries) AS entries, (SELECT count(*) FROM terms) AS terms, (SELECT count(*) FROM entry_term) AS links",
      ),
    ).toMatchObject({ rows: [{ entries: 990, terms: 10, links: 1980 }] });
    const response = await site.harness.dispatch(
      new Request("https://cms.example/post/post-12"),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(
      "<main>Post 12: Topic 2, Topic 3</main>",
    );
  });
});

const TOPIC = { type: "term", taxonomy: "topic", slug: "news", name: "News" };
const POST = {
  type: "entry",
  entryType: "post",
  slug: "hello",
  title: "Hello",
  author: "alice@example.com",
  terms: [{ taxonomy: "topic", slug: "news" }],
};

describe("plumix import, a record that fails", () => {
  const cases: readonly [string, unknown, string][] = [
    [
      "an unknown entry type",
      { ...POST, slug: "x", entryType: "product" },
      'unknown entry type "product"',
    ],
    [
      "an unknown taxonomy",
      { ...TOPIC, taxonomy: "colour" },
      'unknown taxonomy "colour"',
    ],
    [
      "an unknown field",
      { ...POST, slug: "x", meta: { mood: "sunny" } },
      'unknown field "mood"',
    ],
    [
      "a value its field's type rejects",
      { ...POST, slug: "x", meta: { rating: "five" } },
      'field "rating": Invalid value.',
    ],
    [
      "a missing required field",
      { ...POST, slug: "about", entryType: "page", terms: [] },
      'field "summary": This field is required.',
    ],
    [
      "a duplicate type and slug",
      POST,
      "duplicate entry post/hello, first on line 2",
    ],
  ];

  for (const [name, record, reason] of cases) {
    test(`${name} is reported with its file and line, and no rows are written`, async () => {
      const site = await blogSite();
      writeRecords("content.jsonl", [TOPIC, POST, record]);

      await expect(
        importCommand.run(
          importCtx(["content.jsonl"], site.sync, site.harness.app),
        ),
      ).rejects.toMatchObject({
        code: "import_records_invalid",
        message: expect.stringContaining(
          `content.jsonl:3: ${reason}`,
        ) as unknown,
      });
      expect(
        await site.client.execute(
          "SELECT (SELECT count(*) FROM entries) + (SELECT count(*) FROM terms) AS n",
        ),
      ).toMatchObject({ rows: [{ n: 0 }] });
    });
  }
});

async function rowCount(site: Site): Promise<unknown> {
  const result = await site.client.execute(
    "SELECT (SELECT count(*) FROM entries) + (SELECT count(*) FROM terms) AS n",
  );
  return result.rows[0]?.n;
}

describe("plumix import, writing", () => {
  test("--dry-run prints what it would change and writes nothing", async () => {
    const site = await blogSite();
    writeRecords("content.jsonl", [TOPIC, POST]);

    await importCommand.run(
      importCtx(["content.jsonl", "--dry-run"], site.sync, site.harness.app),
    );

    expect(lines).toEqual(
      expect.arrayContaining([
        "  entries: 0 replaced, 1 added, 0 removed",
        "Authors to add as disabled users: alice@example.com",
        "Dry run: nothing was changed.",
      ]),
    );
    expect(await rowCount(site)).toBe(0);
  });

  test("an author the site lacks is added disabled, and one it has is matched by email", async () => {
    const site = await blogSite();
    await site.client.execute(
      "INSERT INTO users (id, email, slug, role) VALUES (4, 'bob@example.com', 'bob', 'editor')",
    );
    writeRecords("content.jsonl", [
      TOPIC,
      POST,
      { ...POST, slug: "second", author: "bob@example.com" },
    ]);

    await importCommand.run(
      importCtx(["content.jsonl"], site.sync, site.harness.app),
    );

    const result = await site.client.execute(
      "SELECT e.slug, u.email, u.role, u.disabled_at IS NOT NULL AS disabled FROM entries e JOIN users u ON u.id = e.author_id ORDER BY e.id",
    );
    expect(
      result.rows.map((row: Record<string, unknown>) => ({ ...row })),
    ).toEqual([
      {
        slug: "hello",
        email: "alice@example.com",
        role: "author",
        disabled: 1,
      },
      { slug: "second", email: "bob@example.com", role: "editor", disabled: 0 },
    ]);
  });

  test("replaces the site's entries and terms, and keeps its settings", async () => {
    const site = await blogSite();
    await site.client.batch([
      "INSERT INTO users (id, email, slug, role) VALUES (1, 'old@example.com', 'old', 'admin')",
      "INSERT INTO entries (id, type, title, slug, author_id) VALUES (1, 'post', 'Old', 'old', 1)",
      `INSERT INTO settings ("group", key, value) VALUES ('site', 'title', '"Kept"')`,
    ]);
    writeRecords("content.jsonl", [TOPIC, POST]);

    await importCommand.run(
      importCtx(["content.jsonl"], site.sync, site.harness.app),
    );

    const result = await site.client.execute(
      "SELECT (SELECT group_concat(slug) FROM entries) AS slugs, (SELECT value FROM settings WHERE key = 'title') AS title",
    );
    expect({ ...result.rows[0] }).toEqual({ slugs: "hello", title: '"Kept"' });
  });

  // An editor's copy of the replaced term holds the version the site had; the
  // imported row must move past it, or that copy's save would overwrite the
  // import (ADR 0048).
  test("moves a replaced term's token past the version the site held", async () => {
    const site = await blogSite();
    await site.client.execute(
      "INSERT INTO terms (id, taxonomy, name, slug, version) VALUES (1, 'topic', 'Old', 'old', 3)",
    );
    writeRecords("content.jsonl", [TOPIC, POST]);

    await importCommand.run(
      importCtx(["content.jsonl"], site.sync, site.harness.app),
    );

    const result = await site.client.execute("SELECT id, version FROM terms");
    expect(result.rows.map((row) => ({ ...row }))).toEqual([
      { id: 1, version: 4 },
    ]);
  });

  test("runs the site's sync:after listeners, with content as the scope", async () => {
    const site = await blogSite();
    const events: unknown[] = [];
    site.harness.app.hooks.addAction("sync:after", (event) => {
      events.push(event);
    });
    writeRecords("content.jsonl", [TOPIC, POST]);

    await importCommand.run(
      importCtx(["content.jsonl"], site.sync, site.harness.app),
    );

    expect(events).toEqual([{ scopes: ["content"], direction: "pull" }]);
  });
});

const REMOTE = "https://example.com";

describe("plumix import --url, into the deployed site", () => {
  test("without --yes on a non-TTY fails before the site is opened", async () => {
    const site = await blogSite();
    const open = vi.spyOn(site.sync, "open");
    writeRecords("content.jsonl", [TOPIC, POST]);

    await expect(
      importCommand.run(
        importCtx(
          ["content.jsonl", "--url", REMOTE],
          site.sync,
          site.harness.app,
        ),
      ),
    ).rejects.toMatchObject({ code: "import_unconfirmed" });
    expect(open).not.toHaveBeenCalled();
  });

  test("on a terminal asks first, and 'no' changes nothing", async () => {
    vi.spyOn(syncDeps, "isInteractive").mockReturnValue(true);
    const confirm = vi.spyOn(syncDeps, "confirm").mockResolvedValue(false);
    const site = await blogSite();
    writeRecords("content.jsonl", [TOPIC, POST]);

    await importCommand.run(
      importCtx(
        ["content.jsonl", "--url", REMOTE],
        site.sync,
        site.harness.app,
      ),
    );

    expect(confirm).toHaveBeenCalledOnce();
    expect(
      await site.remote.execute("SELECT count(*) AS n FROM entries"),
    ).toEqual([{ n: 0 }]);
  });

  test("an import into the deployed site that fails after its snapshot prints how to restore it again", async () => {
    const site = await blogSite();
    writeRecords("content.jsonl", [TOPIC, POST]);
    const failingSettle: RuntimeSync = {
      open: async (options) => ({
        ...(await site.sync.open(options)),
        settle: () => Promise.reject(new Error("settle lost")),
      }),
    };

    await expect(
      importCommand.run(
        importCtx(
          ["content.jsonl", "--url", REMOTE, "--yes"],
          failingSettle,
          site.harness.app,
        ),
      ),
    ).rejects.toThrow("settle lost");

    expect(lines).toContain(
      "The import failed after its snapshot. This in-memory end takes no snapshot: its import is one transaction, so a failed one changes nothing.",
    );
  });

  test.each([
    [["--production"], { production: true }],
    [["--preview"], { preview: true }],
    [["--env", "qa"], { env: "qa" }],
  ] as const)("%j reaches the deployed end as %j", async (flags, values) => {
    const site = await blogSite();
    writeRecords("content.jsonl", [TOPIC, POST]);
    const targetValues: unknown[] = [];
    const deployTargets: RuntimeSync = {
      targetOptions: {
        production: { type: "boolean", description: "The production D1" },
        preview: { type: "boolean", description: "The Worker Previews D1" },
        env: { type: "string", description: "A wrangler environment's D1" },
      },
      open: (options) => {
        targetValues.push(options.targetValues);
        return site.sync.open(options);
      },
    };

    await importCommand.run(
      importCtx(
        ["content.jsonl", "--url", REMOTE, "--yes", ...flags],
        deployTargets,
        site.harness.app,
      ),
    );

    expect(targetValues).toEqual([values]);
  });

  test("with --yes snapshots the deployed site, prints the restore hint, and imports into it", async () => {
    const site = await blogSite();
    writeRecords("content.jsonl", [TOPIC, POST]);

    await importCommand.run(
      importCtx(
        ["content.jsonl", "--url", REMOTE, "--yes"],
        site.sync,
        site.harness.app,
      ),
    );

    expect(lines).toContain(
      "This in-memory end takes no snapshot: its import is one transaction, so a failed one changes nothing.",
    );
    expect(await site.remote.execute("SELECT slug FROM entries")).toEqual([
      { slug: "hello" },
    ]);
    expect(await rowCount(site)).toBe(0);
  });
});

const PROD = "https://prod.example";

/** A content dump a sync from `PROD` wrote, holding one entry by alice. */
async function prodDump(app: PlumixApp, meta: string): Promise<string> {
  const ends = await memorySyncEnds();
  await ends.remote.execute(
    "INSERT INTO users (id, email, slug, role) VALUES (7, 'alice@example.com', 'alice', 'editor')",
  );
  await ends.remote.execute(
    `INSERT INTO entries (id, type, title, slug, author_id, meta) VALUES (1, 'post', 'Hello', 'hello', 7, '${meta}')`,
  );
  const remote = await ends.sync.open({
    cwd: dir,
    config: app.config,
    target: "remote",
    binding: undefined,
    url: PROD,
    apiToken: () => Promise.resolve("unused"),
    owners: resolveOwners(dir, join(dir, "plumix.config.ts"), app.config),
    targetValues: {},
  });
  const path = join(dir, "dump");
  const writer = writeDump(path, {
    source: { origin: PROD, basePath: "" },
    scopes: ["content"],
    heads: await remote.heads(),
  });
  await remote.exportData(
    [{ name: "content", tables: CORE_SYNC_SCOPE_TABLES.content }],
    writer,
  );
  await writer.finish();
  return path;
}

describe("plumix import, a sync dump", () => {
  test("loads the dump's scopes and points its source's URLs at the site", async () => {
    const site = await blogSite();
    await prodDump(
      site.harness.app,
      '{"a":"https://prod.example/about","b":"https://other.example/"}',
    );

    await importCommand.run(importCtx(["dump"], site.sync, site.harness.app));

    const result = await site.client.execute("SELECT meta FROM entries");
    expect(result.rows.map((row: Record<string, unknown>) => row.meta)).toEqual(
      ['{"a":"https://cms.example/about","b":"https://other.example/"}'],
    );
    expect(lines).toContain("  entries: 1 rewritten");
  });

  test("--no-rewrite-urls leaves the dump's content byte-identical", async () => {
    const site = await blogSite();
    await prodDump(site.harness.app, '{ "a": "https://prod.example/about" }');

    await importCommand.run(
      importCtx(["dump", "--no-rewrite-urls"], site.sync, site.harness.app),
    );

    const result = await site.client.execute("SELECT meta FROM entries");
    expect(result.rows.map((row: Record<string, unknown>) => row.meta)).toEqual(
      ['{ "a": "https://prod.example/about" }'],
    );
  });
});

describe("plumix import, a term that fails", () => {
  test("is reported once, not again on every entry that uses it", async () => {
    const site = await blogSite();
    writeRecords("content.jsonl", [{ ...TOPIC, meta: { mood: "x" } }, POST]);

    await expect(
      importCommand.run(
        importCtx(["content.jsonl"], site.sync, site.harness.app),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining("1 record(s)") as unknown,
    });
  });
});

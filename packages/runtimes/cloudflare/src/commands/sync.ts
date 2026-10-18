import { execFile } from "node:child_process";
import { createReadStream, mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import type { ConnectedObjectStorage, PlumixConfig, PlumixEnv } from "plumix";
import type {
  DumpReader,
  MigrationDatabaseTarget,
  OpenSyncEndOptions,
  RuntimeSync,
  SyncAfterEvent,
  SyncEnd,
  SyncRow,
  SyncScope,
  SyncSettleReport,
} from "plumix/cli";
import { resolveEnvInput } from "plumix";
import {
  assertSameHeads,
  readSyncHeads,
  settleDeployedSite,
  settleSync,
} from "plumix/cli";
import { buildApp, createRuntimeHandler } from "plumix/runtime";

import type { SiteReader } from "./sync-reads.js";
import { D1_TARGET_OPTIONS } from "./d1-target.js";
import { CloudflareCliError } from "./errors.js";
import {
  chooseTarget,
  migrationsDeps,
  openProxy,
  slotEntries,
  targetOf,
} from "./migrations.js";
import { writeImportScript } from "./sync-import.js";
import { authorsOf, d1Reader, selectedRows } from "./sync-reads.js";
import { parseDumpLine } from "./sync-sql.js";

/**
 * How an end moves a table in bulk: locally through the platform proxy's D1,
 * remotely through D1's export and import APIs, as wrangler calls them.
 */
interface BulkD1 {
  exportTable(table: string): AsyncIterable<SyncRow>;
  /** Runs a script of one statement per line, all of it or none. */
  execute(script: string): Promise<void>;
}

function localBulk(d1: D1Database, reader: SiteReader): BulkD1 {
  return {
    exportTable: (table) => selectedRows(reader, { table }),
    async execute(script) {
      await d1.exec(await readFile(script, "utf8"));
    },
  };
}

async function* scriptLines(path: string): AsyncIterable<string> {
  const lines = createInterface({
    input: createReadStream(path),
    crlfDelay: Infinity,
  });
  for await (const line of lines) yield line;
}

/** wrangler finds a database it is not bound to by name, through the API. */
function remoteBulk(cwd: string, database: string, scratch: string): BulkD1 {
  return {
    async *exportTable(table) {
      const output = join(scratch, `${table}.sql`);
      await syncDeps.wrangler(cwd, [
        "d1",
        "export",
        database,
        "--remote",
        "--no-schema",
        "--table",
        table,
        "--output",
        output,
        "--skip-confirmation",
      ]);
      try {
        for await (const line of scriptLines(output)) {
          const parsed = parseDumpLine(line);
          if (parsed?.table === table) yield parsed.row;
        }
      } finally {
        rmSync(output, { force: true });
      }
    },
    async execute(script) {
      await syncDeps.wrangler(cwd, [
        "d1",
        "execute",
        database,
        "--remote",
        "--file",
        script,
        "--yes",
      ]);
    },
  };
}

/** Counts a table's rows as they pass, and reports the total once read. */
async function* counted(
  table: string,
  rows: AsyncIterable<SyncRow>,
): AsyncIterable<SyncRow> {
  let total = 0;
  for await (const row of rows) {
    total += 1;
    yield row;
  }
  syncDeps.report(`  ${table}: ${String(total)} rows exported`);
}

function siteStorage(
  config: PlumixConfig,
  env: PlumixEnv,
): ConnectedObjectStorage {
  if (config.storage === undefined) throw CloudflareCliError.syncNoStorage();
  return config.storage.connect(env);
}

async function storedKeys(storage: ConnectedObjectStorage): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await storage.list(undefined, cursor ? { cursor } : {});
    keys.push(...page.items.map((item) => item.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor !== undefined);
  return keys;
}

/** Puts every object of the dump, then deletes the target's others. */
async function replaceObjects(
  storage: ConnectedObjectStorage,
  from: DumpReader,
): Promise<void> {
  const stale = new Set(await storedKeys(storage));
  for await (const object of from.objects()) {
    // R2's put takes a stream only of a known length, which a dump's isn't.
    const bytes = await new Response(object.body).arrayBuffer();
    await storage.put(object.key, bytes, {
      ...(object.contentType && { contentType: object.contentType }),
    });
    stale.delete(object.key);
    syncDeps.report(`  ${object.key} imported`);
  }
  for (const key of stale) {
    await storage.delete(key);
    syncDeps.report(`  ${key} deleted`);
  }
}

function hasMedia(scopes: readonly SyncScope[]): boolean {
  return scopes.some((scope) => scope.name === "media");
}

interface EndParts {
  readonly options: OpenSyncEndOptions;
  readonly d1: D1Database;
  readonly env: PlumixEnv;
  readonly target: MigrationDatabaseTarget;
  readonly bulk: BulkD1;
  readonly scratch: string;
  readonly dispose: () => Promise<void>;
}

async function settleInSite(
  config: PlumixConfig,
  env: PlumixEnv,
  event: SyncAfterEvent,
): Promise<SyncSettleReport> {
  const handler = createRuntimeHandler(await buildApp(config));
  try {
    const { run } = handler;
    if (run === undefined) throw CloudflareCliError.syncSiteCannotRun();
    return await run((ctx) => settleSync(ctx, event), { env });
  } finally {
    await handler.dispose?.();
  }
}

function syncEnd(parts: EndParts): SyncEnd {
  const { options, env, target, bulk, scratch } = parts;
  const reader = d1Reader(parts.d1);
  const remote = options.target === "remote";
  const heads = (): Promise<Record<string, string | null>> =>
    readSyncHeads((sql) => reader.all(sql), options.owners);
  return {
    origin: remote
      ? (options.url ?? "")
      : resolveEnvInput(options.config.auth.passkey.origin, process.env),
    heads,
    async exportData(scopes, into) {
      const tables = scopes.flatMap((scope) => scope.tables);
      for (const table of tables) {
        const rows =
          table.where === undefined
            ? bulk.exportTable(table.table)
            : selectedRows(reader, table);
        await into.table(table.table, counted(table.table, rows));
      }
      if (!tables.some((table) => table.table === "users")) {
        await into.authors(
          (async function* () {
            yield* await authorsOf(reader, tables);
          })(),
        );
      }
      if (!hasMedia(scopes)) return;
      const storage = siteStorage(options.config, env);
      for (const key of await storedKeys(storage)) {
        const found = await storage.get(key);
        if (found === null) continue;
        await into.object(key, found.body, found.contentType);
        syncDeps.report(`  ${key} exported`);
      }
    },
    async importData(from, scopes, { dryRun }) {
      assertSameHeads(
        { label: "the dump", heads: from.manifest.heads },
        { label: options.target, heads: await heads() },
      );
      const script = join(scratch, "import.sql");
      try {
        const written = await writeImportScript(reader, from, scopes, script, {
          now: syncDeps.now(),
          ...(!dryRun && {
            onTable: (table) => {
              syncDeps.report(
                `  ${table.table}: ${String(table.replaced + table.added)} rows to import`,
              );
            },
          }),
        });
        if (dryRun) return written.report;
        if (written.statements > 0) {
          syncDeps.report(
            `Importing ${String(written.statements)} statements into ${target.summary}`,
          );
          await bulk.execute(script);
        }
        if (hasMedia(scopes)) {
          await replaceObjects(siteStorage(options.config, env), from);
        }
        return written.report;
      } finally {
        rmSync(script, { force: true });
      }
    },
    async snapshot() {
      if (!remote) return { id: "local" };
      return {
        id: await migrationsDeps.timeTravelBookmark(options.cwd, target.name),
      };
    },
    restoreHint(snapshot) {
      if (!remote) {
        return "The local database keeps no snapshot; pull again to restore it.";
      }
      return `Snapshot: D1 Time Travel bookmark ${snapshot.id}. To restore ${target.name} as it was before this import, run \`wrangler d1 time-travel restore ${target.name} --bookmark=${snapshot.id}\`. Time Travel restores the database, not the media objects.`;
    },
    settle(event) {
      if (remote) {
        return settleDeployedSite(options.url ?? "", event);
      }
      return settleInSite(options.config, env, event);
    },
    async close() {
      rmSync(scratch, { recursive: true, force: true });
      await parts.dispose();
    },
  };
}

/** The remote end is a deployed database, so a target option must name it. */
async function openEnd(options: OpenSyncEndOptions): Promise<SyncEnd> {
  const { cwd, config, binding } = options;
  const remote = options.target === "remote";
  const { chosen, deployTarget } = await chooseTarget(
    cwd,
    config,
    binding,
    remote ? options.targetValues : {},
  );
  if (remote && deployTarget === null) {
    throw CloudflareCliError.syncRemoteTargetMissing();
  }
  const reach = remote ? "remote" : "local";
  const { proxy, dispose } = await openProxy(
    cwd,
    chosen,
    reach,
    slotEntries(config, chosen.block),
  );
  const target = targetOf(chosen, reach);
  if (remote) {
    syncDeps.report(`→ ${target.summary}`);
    for (const note of target.notes) syncDeps.report(`  ${note}`);
  }
  const d1 = proxy.env[chosen.entry.binding] as D1Database;
  const scratch = mkdtempSync(join(tmpdir(), "plumix-sync-"));
  return syncEnd({
    options,
    d1,
    env: { ...process.env, ...proxy.env },
    target,
    bulk: remote
      ? remoteBulk(cwd, target.name, scratch)
      : localBulk(d1, d1Reader(d1)),
    scratch,
    dispose,
  });
}

/**
 * `plumix sync` on Cloudflare: the local end is the D1 and storage `plumix
 * dev` uses, and the remote end the deployed ones a target option names.
 */
export const sync: RuntimeSync = {
  targetOptions: D1_TARGET_OPTIONS,
  open: openEnd,
};

/**
 * Mutable seam for tests — substitute the collaborator, not the module path.
 */
export const syncDeps = {
  wrangler: async (cwd: string, args: readonly string[]): Promise<void> => {
    await promisify(execFile)("wrangler", [...args], { cwd });
  },
  report: (line: string): void => {
    process.stderr.write(`${line}\n`);
  },
  now: (): Date => new Date(),
};

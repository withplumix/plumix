import type { AppContext } from "../context/app-context.js";
import type { SyncScope } from "../context/runtime-adapter.js";
import type { SyncDatabase } from "./contract/slots.js";
import { exportScopes, importScopes } from "../cli/sync-replace.js";
import { resolveScopes } from "../cli/sync-scopes.js";
import { readWireDump, SYNC_WIRE_TYPE, wireStream } from "../cli/sync-wire.js";
import {
  headDifferences,
  isSyncError,
  readSyncHeads,
  SyncError,
} from "../cli/sync.js";
import { jsonResponse, methodNotAllowed } from "./contract/http.js";
import { authorizeSyncOperator } from "./sync-operator.js";

/** The sync routes that move a site's data, each with the method it takes. */
const ACTIONS = {
  heads: "GET",
  export: "GET",
  import: "POST",
  snapshot: "POST",
} as const;

export type SyncTransferAction = keyof typeof ACTIONS;

export function isSyncTransferAction(name: string): name is SyncTransferAction {
  return Object.hasOwn(ACTIONS, name);
}

/** Every owner's tracking table, which is all the site can name a head by. */
const TRACKING_TABLES_SQL =
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '\\_\\_drizzle\\_migrations%' ESCAPE '\\' ORDER BY name";

function syncErrorResponse(error: SyncError, status: number): Response {
  return jsonResponse(
    { error: { code: error.code, message: error.message } },
    { status },
  );
}

async function headsOf(
  database: SyncDatabase,
  tables: readonly string[],
): Promise<Record<string, string | null>> {
  return readSyncHeads(
    (sql) => database.execute(sql),
    tables.map((table) => ({
      name: table,
      migrationsTable: table,
      migrationsFolder: "",
    })),
  );
}

async function trackingTables(database: SyncDatabase): Promise<string[]> {
  const rows = await database.execute(TRACKING_TABLES_SQL);
  return rows.map((row) => String(row.name));
}

function requestedScopes(ctx: AppContext): SyncScope[] {
  const names = new URL(ctx.request.url).searchParams.get("scopes") ?? "";
  return resolveScopes(
    names.split(",").filter((name) => name !== ""),
    ctx.config,
  );
}

/** Each scope cut down to the tables the caller named for it. */
function narrowed(
  scopes: readonly SyncScope[],
  tables: Readonly<Record<string, readonly string[]>>,
): SyncScope[] {
  return scopes.map((scope) => {
    const named = tables[scope.name];
    if (named === undefined) return scope;
    const own = new Set(scope.tables.map((table) => table.table));
    const foreign = named.find((table) => !own.has(table));
    if (foreign !== undefined) {
      throw SyncError.tableOutsideScope({ scope: scope.name, table: foreign });
    }
    return {
      name: scope.name,
      tables: scope.tables.filter((table) => named.includes(table.table)),
    };
  });
}

async function heads(database: SyncDatabase): Promise<Response> {
  const tables = await trackingTables(database);
  return jsonResponse({ heads: await headsOf(database, tables) });
}

function exportDump(ctx: AppContext, database: SyncDatabase): Response {
  const scopes = requestedScopes(ctx);
  const body = wireStream(async (_write, writer) => {
    try {
      await exportScopes(database, ctx.storage, scopes, writer);
    } finally {
      await database.close();
    }
  });
  return new Response(body, { headers: { "content-type": SYNC_WIRE_TYPE } });
}

async function importDump(
  ctx: AppContext,
  database: SyncDatabase,
): Promise<Response> {
  const requested = requestedScopes(ctx);
  const dryRun = new URL(ctx.request.url).searchParams.get("dryRun") === "true";
  if (ctx.request.body === null) throw SyncError.dumpIncomplete();
  const dump = await readWireDump(ctx.request.body);
  const scopes = narrowed(requested, dump.tables);
  const dumpHeads = dump.reader.manifest.heads;
  const own = await headsOf(database, Object.keys(dumpHeads));
  const differences = headDifferences(
    { label: "the dump", heads: dumpHeads },
    { label: "this site", heads: own },
  );
  if (differences.length > 0) {
    return jsonResponse(
      { error: { code: "sync_migrations_differ", differences } },
      { status: 409 },
    );
  }
  const report = await importScopes(
    database,
    ctx.storage,
    dump.reader,
    scopes,
    {
      dryRun,
      heads: own,
      label: "this site",
      beforeCommit: () => dump.finish(),
    },
  );
  return jsonResponse(report);
}

async function answer(
  ctx: AppContext,
  action: SyncTransferAction,
  database: SyncDatabase,
): Promise<Response> {
  switch (action) {
    case "heads":
      return heads(database);
    case "export":
      return exportDump(ctx, database);
    case "import":
      return importDump(ctx, database);
    case "snapshot":
      return jsonResponse(await database.snapshot());
  }
}

/**
 * The routes `plumix sync` reaches a deployed site through. They answer 501
 * where the database slot cannot open itself for a sync.
 */
export async function handleSyncTransfer(
  ctx: AppContext,
  action: SyncTransferAction,
): Promise<Response> {
  const method = ACTIONS[action];
  if (ctx.request.method !== method) return methodNotAllowed([method]);
  const authed = await authorizeSyncOperator(ctx);
  if (authed instanceof Response) return authed;
  const { openSync } = authed.config.database;
  if (openSync === undefined) {
    return jsonResponse(
      { error: { code: "sync_unsupported_database" } },
      { status: 501 },
    );
  }
  const database = openSync(authed.env);
  // The export closes it once its stream has ended.
  let streaming = false;
  try {
    const response = await answer(authed, action, database);
    streaming = action === "export";
    return response;
  } catch (error) {
    if (isSyncError(error)) return syncErrorResponse(error, 400);
    throw error;
  } finally {
    if (!streaming) await database.close();
  }
}

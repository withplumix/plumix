import { existsSync, rmSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { getTableName } from "drizzle-orm";

import type {
  CommandContext,
  CommandDefinition,
  DumpReader,
  PlumixApp,
  SyncEnd,
  SyncRow,
  SyncScope,
  SyncTarget,
  TargetOptionValues,
} from "@plumix/core";
import { CORE_SYNC_SCOPE_TABLES } from "@plumix/core/cli";
import { settings } from "@plumix/core/schema";

import type { AuthoringRows } from "../import/records.js";
import type { RewrittenDump } from "../sync/rewrite-urls.js";
import { PlumixCliError } from "../errors.js";
import { readAuthoringRecords } from "../import/records.js";
import { resolveOwners } from "../migrate/owners.js";
import { report } from "../report.js";
import { readDump, writeDump } from "../sync/dump.js";
import { rewriteUrls } from "../sync/rewrite-urls.js";
import { resolveScopes } from "../sync/scopes.js";
import { parseCommandArgs } from "../target-options.js";
import {
  closeAll,
  describeImport,
  describeRewrite,
  describeSettle,
  dumpName,
  runtimeSyncOf,
  syncDeps,
} from "./sync.js";

/** Under `.plumix`, which a scaffolded project ignores. */
const DUMPS_DIR = ".plumix/import";

/**
 * Content's tables bar `settings`: an authoring file holds no settings, so
 * the site keeps its own.
 */
const AUTHORING_SCOPE: SyncScope = {
  name: "content",
  tables: CORE_SYNC_SCOPE_TABLES.content.filter(
    (table) => table.table !== getTableName(settings),
  ),
};

interface ImportArgs {
  readonly input: string;
  readonly url: string | undefined;
  readonly binding: string | undefined;
  readonly dryRun: boolean;
  readonly yes: boolean;
  readonly rewriteUrls: boolean;
  readonly targetValues: TargetOptionValues;
}

function parseImportArgs(ctx: CommandContext<PlumixApp>): ImportArgs {
  const parsed = parseCommandArgs(ctx.argv, {
    command: "import",
    runtime: ctx.app.config.runtime.name,
    options: {
      url: { type: "string" },
      binding: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
      "no-rewrite-urls": { type: "boolean", default: false },
    },
    targetOptions: ctx.runtimeSync?.targetOptions,
    invalid: (cause) => PlumixCliError.importInvalidArguments({ cause }),
  });
  const [input, extra] = parsed.positionals;
  if (input === undefined || extra !== undefined) {
    throw PlumixCliError.importInvalidArguments({
      cause:
        input === undefined
          ? "Name a sync dump directory or an authoring file"
          : `Unexpected argument '${extra ?? ""}'`,
    });
  }
  return {
    input,
    url: parsed.values.url,
    binding: parsed.values.binding,
    dryRun: parsed.values["dry-run"],
    yes: parsed.values.yes,
    rewriteUrls: !parsed.values["no-rewrite-urls"],
    targetValues: parsed.targetValues,
  };
}

/** What the input loads: a sync dump as it is, or authoring records. */
type ImportInput =
  | { readonly kind: "dump"; readonly dump: DumpReader }
  | { readonly kind: "authoring"; readonly rows: AuthoringRows };

async function readInput(
  path: string,
  shown: string,
  app: PlumixApp,
): Promise<ImportInput> {
  if (statSync(path).isDirectory()) {
    return { kind: "dump", dump: await readDump(path) };
  }
  const { checkImportedMeta, slugify } = await import("@plumix/core");
  return {
    kind: "authoring",
    rows: await readAuthoringRecords(path, shown, {
      registry: app.plugins,
      checkMeta: (owner, meta) => checkImportedMeta(app.plugins, owner, meta),
      slugify,
      now: syncDeps.now(),
    }),
  };
}

async function* iterate(rows: readonly SyncRow[]): AsyncIterable<SyncRow> {
  for (const row of rows) {
    await Promise.resolve();
    yield row;
  }
}

async function authoringDump(
  dir: string,
  rows: AuthoringRows,
  target: SyncEnd,
  basePath: string,
): Promise<DumpReader> {
  const writer = writeDump(dir, {
    source: { origin: target.origin, basePath },
    scopes: [AUTHORING_SCOPE.name],
    heads: await target.heads(),
  });
  await writer.table("terms", iterate(rows.terms));
  await writer.table("entries", iterate(rows.entries));
  await writer.table("entry_term", iterate(rows.entryTerms));
  await writer.authors(iterate(rows.authors));
  await writer.finish();
  return readDump(dir);
}

interface ImportRun {
  readonly args: ImportArgs;
  readonly target: SyncEnd;
  readonly targetName: SyncTarget;
  readonly scopes: readonly SyncScope[];
  readonly basePath: string;
}

/**
 * A dump carries its source's origin, so its URLs are pointed at the target as
 * `plumix sync` points them. Authoring records carry none.
 */
function prepared(run: ImportRun, dump: DumpReader): RewrittenDump {
  if (!run.args.rewriteUrls) return { dump, rewritten: () => new Map() };
  return rewriteUrls(dump, {
    origin: run.target.origin,
    basePath: run.basePath,
  });
}

async function confirmed(run: ImportRun): Promise<boolean> {
  if (run.args.dryRun) {
    report.info("Dry run: nothing was changed.");
    return false;
  }
  if (run.targetName === "local" || run.args.yes) return true;
  const accepted = await syncDeps.confirm(
    `Replace this data on ${run.target.origin}?`,
  );
  if (!accepted) report.info("Nothing was changed.");
  return accepted;
}

async function load(run: ImportRun, dump: DumpReader): Promise<void> {
  const { dump: rewrittenDump, rewritten } = prepared(run, dump);
  describeImport(
    run.targetName,
    await run.target.importData(rewrittenDump, run.scopes, { dryRun: true }),
  );
  describeRewrite(
    dump.manifest.source,
    { origin: run.target.origin, basePath: run.basePath },
    rewritten(),
  );
  if (!(await confirmed(run))) return;
  if (run.targetName === "remote") {
    const snapshot = await run.target.snapshot();
    report.info(run.target.restoreHint(snapshot));
  }
  await run.target.importData(rewrittenDump, run.scopes, { dryRun: false });
  report.success(`Replaced the data on the ${run.targetName} site.`);
  const directionIntoTarget = run.targetName === "local" ? "pull" : "push";
  describeSettle(
    await run.target.settle({
      scopes: run.scopes.map((scope) => scope.name),
      direction: directionIntoTarget,
    }),
  );
}

/** A dump written from authoring records outlives a failed import. */
async function loadAuthoring(
  cwd: string,
  run: ImportRun,
  rows: AuthoringRows,
): Promise<void> {
  const dir = join(cwd, DUMPS_DIR, dumpName("import", syncDeps.now()));
  try {
    await load(run, await authoringDump(dir, rows, run.target, run.basePath));
  } catch (error) {
    if (existsSync(dir)) {
      report.info(`The dump is kept at ${relative(cwd, dir)}`);
    }
    throw error;
  }
  rmSync(dir, { recursive: true, force: true });
}

export const importCommand: CommandDefinition<PlumixApp> = {
  describe: "Replace the local or the deployed site's content with a file's",
  async run(ctx) {
    const args = parseImportArgs(ctx);
    const targetName: SyncTarget = args.url === undefined ? "local" : "remote";
    if (
      targetName === "remote" &&
      !args.yes &&
      !args.dryRun &&
      !syncDeps.isInteractive()
    ) {
      throw PlumixCliError.importUnconfirmed();
    }
    const config = ctx.app.config;
    const sync = runtimeSyncOf(ctx);
    const input = await readInput(
      resolve(ctx.cwd, args.input),
      args.input,
      ctx.app,
    );
    const scopes =
      input.kind === "dump"
        ? resolveScopes(input.dump.manifest.scopes, config)
        : [AUTHORING_SCOPE];
    const target = await sync.open({
      cwd: ctx.cwd,
      config,
      target: targetName,
      binding: args.binding,
      url: args.url,
      owners: resolveOwners(ctx.cwd, ctx.configPath, config),
      targetValues: args.targetValues,
    });
    try {
      const run: ImportRun = {
        args,
        target,
        targetName,
        scopes,
        basePath: config.basePath,
      };
      if (input.kind === "dump") await load(run, input.dump);
      else await loadAuthoring(ctx.cwd, run, input.rows);
    } finally {
      await closeAll([target]);
    }
  },
};

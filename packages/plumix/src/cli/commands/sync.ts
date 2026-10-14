import { existsSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";

import type {
  CommandContext,
  CommandDefinition,
  DumpReader,
  RuntimeSync,
  SyncDirection,
  SyncEnd,
  SyncImportReport,
  SyncScope,
  SyncSettleReport,
  SyncTarget,
} from "@plumix/core";
import { assertSameHeads } from "@plumix/core/cli";

import { PlumixCliError } from "../errors.js";
import { resolveOwners } from "../migrate/owners.js";
import { report } from "../report.js";
import { readDump, writeDump } from "../sync/dump.js";
import { exportLocalAdmins, keepLocalAdmins } from "../sync/local-admins.js";
import { resolveScopes } from "../sync/scopes.js";

const DIRECTIONS: readonly SyncDirection[] = ["pull", "push"];

/** Under `.plumix`, which a scaffolded project ignores. */
const DUMPS_DIR = ".plumix/sync";

interface SyncArgs {
  readonly direction: SyncDirection;
  readonly scopes: readonly string[];
  readonly url: string | undefined;
  readonly binding: string | undefined;
  readonly dryRun: boolean;
  readonly yes: boolean;
}

function isDirection(value: string | undefined): value is SyncDirection {
  return DIRECTIONS.includes(value as SyncDirection);
}

function parseSyncArgs(argv: readonly string[]): SyncArgs {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      options: {
        scope: { type: "string", multiple: true },
        url: { type: "string" },
        binding: { type: "string" },
        "dry-run": { type: "boolean", default: false },
        yes: { type: "boolean", default: false },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (cause) {
    throw PlumixCliError.syncInvalidArguments({ cause });
  }
  const [direction, extra] = parsed.positionals;
  if (!isDirection(direction)) {
    throw PlumixCliError.unknownSubcommand({
      command: "sync",
      subcommand: direction,
      supported: DIRECTIONS,
    });
  }
  if (extra !== undefined) {
    throw PlumixCliError.syncInvalidArguments({
      cause: `Unexpected argument '${extra}'`,
    });
  }
  return {
    direction,
    scopes: parsed.values.scope ?? [],
    url: parsed.values.url,
    binding: parsed.values.binding,
    dryRun: parsed.values["dry-run"],
    yes: parsed.values.yes,
  };
}

async function confirm(question: string): Promise<boolean> {
  const prompt = createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  try {
    const answer = await prompt.question(`${question} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    prompt.close();
  }
}

/**
 * Mutable seam for tests — substitute the collaborator, not the module path.
 */
export const syncDeps = {
  isInteractive: (): boolean => process.stdin.isTTY && process.stderr.isTTY,
  confirm,
  now: (): Date => new Date(),
};

function dumpName(direction: SyncDirection, now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  return `${direction}-${stamp}`;
}

function describeImport(target: SyncTarget, result: SyncImportReport): void {
  report.info(`Rows on the ${target} site:`);
  for (const table of result.tables) {
    report.info(
      `  ${table.table}: ${String(table.replaced)} replaced, ${String(table.added)} added, ${String(table.removed)} removed`,
    );
  }
  if (result.dependents.length > 0) {
    report.info("Rows outside the sync that referenced replaced rows:");
    for (const dependent of result.dependents) {
      report.info(
        `  ${dependent.table}: ${String(dependent.removed)} removed, ${String(dependent.cleared)} cleared`,
      );
    }
  }
  if (result.authorsAdded.length > 0) {
    report.info(
      `Authors to add as disabled users: ${result.authorsAdded.join(", ")}`,
    );
  }
}

function describeSettle(settled: SyncSettleReport): void {
  if (settled.cdn === "purged") report.success("Purged the whole CDN.");
  if (settled.cdn === "cannot-purge") {
    report.info(
      "The CDN can't purge everything, so cached pages refresh as their ttl runs out.",
    );
  }
  if (settled.failures.length > 0) {
    throw PlumixCliError.syncSettleFailed({ failures: settled.failures });
  }
}

interface SyncRun {
  readonly args: SyncArgs;
  readonly scopes: readonly SyncScope[];
  readonly source: SyncEnd;
  readonly target: SyncEnd;
  readonly targetName: SyncTarget;
  readonly dumpDir: string;
  readonly basePath: string;
}

/** Exports the source into the dump directory, then reads it back. */
async function exportDump(run: SyncRun): Promise<DumpReader> {
  const writer = writeDump(run.dumpDir, {
    source: { origin: run.source.origin, basePath: run.basePath },
    scopes: run.scopes.map((scope) => scope.name),
    heads: await run.source.heads(),
  });
  await run.source.exportData(run.scopes, writer);
  await writer.finish();
  const dump = await readDump(run.dumpDir);
  const keepsAdmins =
    run.args.direction === "pull" &&
    run.scopes.some((scope) => scope.name === "users");
  if (!keepsAdmins) return dump;
  return keepLocalAdmins(dump, await exportLocalAdmins(run.target));
}

/** Whether to go on past the dry run; a push asks unless `--yes`. */
async function confirmed(run: SyncRun): Promise<boolean> {
  if (run.args.dryRun) {
    report.info("Dry run: nothing was changed.");
    return false;
  }
  if (run.args.direction === "pull" || run.args.yes) return true;
  const accepted = await syncDeps.confirm(
    `Replace this data on ${run.target.origin}?`,
  );
  if (!accepted) report.info("Nothing was changed.");
  return accepted;
}

async function replaceTarget(run: SyncRun): Promise<void> {
  const dump = await exportDump(run);
  describeImport(
    run.targetName,
    await run.target.importData(dump, run.scopes, { dryRun: true }),
  );
  if (!(await confirmed(run))) return;
  if (run.args.direction === "push") {
    const snapshot = await run.target.snapshot();
    report.info(run.target.restoreHint(snapshot));
  }
  await run.target.importData(dump, run.scopes, { dryRun: false });
  report.success(`Replaced the data on the ${run.targetName} site.`);
  describeSettle(
    await run.target.settle({
      scopes: run.scopes.map((scope) => scope.name),
      direction: run.args.direction,
    }),
  );
}

/** A dump outlives a failed sync, so its rows can be inspected or retried. */
async function replaceKeepingDumpOnFailure(
  cwd: string,
  run: SyncRun,
): Promise<void> {
  try {
    await replaceTarget(run);
  } catch (error) {
    if (existsSync(run.dumpDir)) {
      report.info(`The dump is kept at ${relative(cwd, run.dumpDir)}`);
    }
    throw error;
  }
  rmSync(run.dumpDir, { recursive: true, force: true });
}

function runtimeSyncOf(ctx: CommandContext): RuntimeSync {
  if (ctx.runtimeSync === undefined) {
    throw PlumixCliError.syncRuntimeUnsupported({
      runtime: ctx.app.config.runtime.name,
    });
  }
  return ctx.runtimeSync;
}

export const syncCommand: CommandDefinition = {
  describe: "Replace the local or the deployed site's data with the other's",
  async run(ctx) {
    const args = parseSyncArgs(ctx.argv);
    if (
      args.direction === "push" &&
      !args.yes &&
      !args.dryRun &&
      !syncDeps.isInteractive()
    ) {
      throw PlumixCliError.syncPushUnconfirmed();
    }
    const config = ctx.app.config;
    const scopes = resolveScopes(args.scopes, config);
    const sync = runtimeSyncOf(ctx);
    if (args.url === undefined) throw PlumixCliError.syncRemoteUrlRequired();
    const owners = resolveOwners(ctx.cwd, ctx.configPath, config);
    const open = (target: SyncTarget): Promise<SyncEnd> =>
      sync.open({
        cwd: ctx.cwd,
        config,
        target,
        binding: args.binding,
        url: args.url,
        owners,
      });
    const ends: SyncEnd[] = [];
    try {
      const local = await open("local");
      ends.push(local);
      const remote = await open("remote");
      ends.push(remote);
      assertSameHeads(
        { label: "local", heads: await local.heads() },
        { label: "remote", heads: await remote.heads() },
      );
      const pull = args.direction === "pull";
      const dumpDir = join(
        ctx.cwd,
        DUMPS_DIR,
        dumpName(args.direction, syncDeps.now()),
      );
      await replaceKeepingDumpOnFailure(ctx.cwd, {
        args,
        scopes,
        source: pull ? remote : local,
        target: pull ? local : remote,
        targetName: pull ? "local" : "remote",
        dumpDir,
        basePath: config.basePath,
      });
    } finally {
      for (const end of ends) await end.close();
    }
  },
};

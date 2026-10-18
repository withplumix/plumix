import type {
  AppContext,
  CommandContext,
  CommandDefinition,
  MetaSweep,
  PlumixApp,
  RunEnvironment,
  TargetOptionValues,
} from "@plumix/core";
import { loadOnce } from "@plumix/core/support";

import { PlumixCliError } from "../errors.js";
import { report } from "../report.js";
import { withSiteRun } from "../site-run.js";
import { parseCommandArgs } from "../target-options.js";
import { syncDeps } from "./sync.js";

/**
 * Dynamic, like `cron run`'s: the static graph of `src/cli/index.ts` must not
 * put core's root barrel on every `plumix` invocation.
 */
const loadCore = loadOnce(() => import("@plumix/core"));

export const metaCommand: CommandDefinition<PlumixApp> = {
  describe:
    "Report stored field values not in their field's declared form, or settle them",
  async run(ctx) {
    const args = parseMetaArgs(ctx);
    await withSiteRun(
      ctx,
      {
        binding: args.binding,
        targetValues: args.targetValues,
        unreachable: (unreachable) =>
          PlumixCliError.metaDatabaseUnreachable(unreachable),
      },
      async (siteRun, opened) => {
        const { sweepAllUnsettledMeta } = await loadCore();
        const run: SweepRun = (work) =>
          siteRun((appCtx) => work(appCtx, sweepAllUnsettledMeta));
        await sweepUnder(run, opened, args);
      },
    );
  },
};

async function sweepUnder(
  run: SweepRun,
  opened: RunEnvironment,
  args: MetaArgs,
): Promise<void> {
  report.info(`→ ${opened.target.summary}`);
  if (args.sub === "report") {
    printSweep(await run(reportOnly), "report");
    return;
  }
  if (!(await confirmedSettle(run, opened, args))) return;
  printSweep(await run(settle), "settled");
}

interface MetaArgs {
  readonly sub: "report" | "settle";
  readonly binding: string | undefined;
  readonly targetValues: TargetOptionValues;
  readonly dryRun: boolean;
  readonly yes: boolean;
}

function parseMetaArgs(ctx: CommandContext<PlumixApp>): MetaArgs {
  const parsed = parseCommandArgs(ctx.argv, {
    command: "meta",
    runtime: ctx.app.config.runtime.name,
    options: {
      binding: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
    },
    targetOptions: ctx.runtimeMigrations?.targetOptions,
    invalid: (cause) => PlumixCliError.metaInvalidArguments({ cause }),
  });
  const [sub = "report", extra] = parsed.positionals;
  if (sub !== "report" && sub !== "settle") {
    throw PlumixCliError.unknownSubcommand({
      command: "meta",
      subcommand: sub,
      supported: ["report", "settle"],
    });
  }
  if (extra !== undefined) {
    throw PlumixCliError.metaInvalidArguments({
      cause: `Unexpected argument '${extra}'`,
    });
  }
  return {
    sub,
    binding: parsed.values.binding,
    targetValues: parsed.targetValues,
    dryRun: parsed.values["dry-run"],
    yes: parsed.values.yes,
  };
}

type SweepResult = Omit<MetaSweep, "next">;

type Sweep = (
  ctx: AppContext,
  options: { readonly write: boolean },
) => Promise<SweepResult>;

/** One `handler.run` of a sweep, against the env the runtime opened. */
type SweepRun = (
  work: (ctx: AppContext, sweep: Sweep) => Promise<SweepResult>,
) => Promise<SweepResult>;

function reportOnly(ctx: AppContext, sweep: Sweep): Promise<SweepResult> {
  return sweep(ctx, { write: false });
}

async function settle(ctx: AppContext, sweep: Sweep): Promise<SweepResult> {
  const { settled } = await sweep(ctx, { write: true });
  // Report what is left after settling, not what the settle found: anything
  // still listed is what it couldn't convert.
  const left = await sweep(ctx, { write: false });
  return { keys: left.keys, settled };
}

/**
 * A deployed database is written only once its plan has printed and been
 * confirmed, the rule `plumix migrate` follows.
 */
async function confirmedSettle(
  run: SweepRun,
  opened: RunEnvironment,
  args: MetaArgs,
): Promise<boolean> {
  if (!opened.target.remote && !args.dryRun) return true;
  for (const note of opened.target.notes) report.info(`  ${note}`);
  printSweep(await run(reportOnly), "plan");
  if (args.dryRun) {
    report.info("Dry run: nothing was changed.");
    return false;
  }
  if (args.yes) return true;
  if (!syncDeps.isInteractive()) throw PlumixCliError.metaSettleUnconfirmed();
  const accepted = await syncDeps.confirm(
    `Settle these values in ${opened.target.summary}?`,
  );
  if (!accepted) report.info("Nothing was changed.");
  return accepted;
}

/** A plan leaves out the hint to settle: the settle is what comes next. */
function printSweep(
  result: SweepResult,
  shown: "report" | "plan" | "settled",
): void {
  if (shown === "settled") {
    report.success(`Settled values in ${String(result.settled)} row(s).`);
  }
  if (result.keys.length === 0) {
    report.success(
      "Every stored field value is in the form its field declares.",
    );
    return;
  }
  for (const key of result.keys) {
    const where = [key.store, key.scope, key.key].filter(Boolean).join(" ");
    const ids =
      key.unconvertibleIds.length > 0
        ? ` (ids ${key.unconvertibleIds.join(", ")})`
        : "";
    report.info(
      `${where}: ${String(key.settleable)} to settle, ${String(key.unconvertible)} no field type accepts${ids}`,
    );
  }
  if (shown !== "report") return;
  const settleable = result.keys.reduce((sum, key) => sum + key.settleable, 0);
  if (settleable > 0) report.info("Run `plumix meta settle` to settle them.");
}

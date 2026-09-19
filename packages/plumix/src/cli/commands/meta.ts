import type {
  CommandContext,
  CommandDefinition,
  MetaSweep,
  PlumixHandler,
} from "@plumix/core";
import { CliError } from "@plumix/core/cli";

import { report } from "../report.js";

export const metaCommand: CommandDefinition = {
  describe:
    "Report stored field values not in their field's declared form, or settle them",
  async run(ctx) {
    const sub = ctx.argv[0] ?? "report";
    if (sub !== "report" && sub !== "settle") {
      throw CliError.unknownSubcommand({
        command: "meta",
        subcommand: sub,
        supported: ["report", "settle"],
      });
    }
    const write = sub === "settle";
    printSweep(await sweep(ctx, write), write);
  },
};

/**
 * Runs the same sweep the admin's Field values page runs, through the site's
 * own handler — so the database, the plugins declaring each field, and the CDN
 * purges a settle enqueues are the site's, not a reimplementation of them.
 */
async function sweep(
  ctx: CommandContext,
  write: boolean,
): Promise<Omit<MetaSweep, "next">> {
  // Dynamic, like `cron run`'s: the static graph of `src/cli/index.ts` must
  // not put core's root barrel on every `plumix` invocation.
  const { sweepAllUnsettledMeta } = await import("@plumix/core");

  // `nodeSqlite` resolves its path against the process cwd, so `--cwd` has to
  // land before anything opens a database.
  if (ctx.cwd !== process.cwd()) process.chdir(ctx.cwd);

  const handler: PlumixHandler = ctx.app.config.runtime.createHandler(ctx.app);
  if (handler.run === undefined) {
    throw CliError.metaDatabaseUnreachable({
      detail: "this runtime's handler can't run work outside a request",
      cause: undefined,
    });
  }
  // Only a failure before the sweep starts means the database couldn't be
  // reached — a D1 binding that exists only inside the Worker fails there. A
  // failure inside the sweep is the sweep's own, and surfaces as itself.
  const phase = { started: false };
  try {
    return await handler.run(
      async (appCtx) => {
        phase.started = true;
        if (!write) return sweepAllUnsettledMeta(appCtx, { write: false });
        const { settled } = await sweepAllUnsettledMeta(appCtx, {
          write: true,
        });
        // Report what is left after settling, not what the settle found:
        // anything still listed is what it couldn't convert.
        const left = await sweepAllUnsettledMeta(appCtx, { write: false });
        return { keys: left.keys, settled };
      },
      { env: process.env },
    );
  } catch (cause) {
    if (phase.started) throw cause;
    throw CliError.metaDatabaseUnreachable({ detail: messageOf(cause), cause });
  } finally {
    // Deferred work — the CDN purges a settle enqueued — is still running
    // until `dispose()` returns.
    try {
      await handler.dispose?.();
    } catch (error) {
      report.detail(`Could not drain the handler: ${messageOf(error)}`);
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function printSweep(result: Omit<MetaSweep, "next">, wrote: boolean): void {
  if (wrote) {
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
  if (wrote) return;
  const settleable = result.keys.reduce((sum, key) => sum + key.settleable, 0);
  if (settleable > 0) report.info("Run `plumix meta settle` to settle them.");
}

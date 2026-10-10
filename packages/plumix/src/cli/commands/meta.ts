import type {
  CommandContext,
  CommandDefinition,
  MetaSweep,
  PlumixApp,
  PlumixHandler,
} from "@plumix/core";

import { PlumixCliError } from "../errors.js";
import { report } from "../report.js";

export const metaCommand: CommandDefinition<PlumixApp> = {
  describe:
    "Report stored field values not in their field's declared form, or settle them",
  async run(ctx) {
    const sub = ctx.argv[0] ?? "report";
    if (sub !== "report" && sub !== "settle") {
      throw PlumixCliError.unknownSubcommand({
        command: "meta",
        subcommand: sub,
        supported: ["report", "settle"],
      });
    }
    const write = sub === "settle";
    printSweep(await sweep(ctx, write), write);
  },
};

// Runs through the site's own handler so the database, field declarations and
// CDN purges are the site's, not a reimplementation.
async function sweep(
  ctx: CommandContext<PlumixApp>,
  write: boolean,
): Promise<Omit<MetaSweep, "next">> {
  // Dynamic, like `cron run`'s: the static graph of `src/cli/index.ts` must
  // not put core's root barrel on every `plumix` invocation.
  const { createRuntimeHandler, sweepAllUnsettledMeta } =
    await import("@plumix/core");

  // `nodeSqlite` resolves its path against the process cwd, so `--cwd` has to
  // land before anything opens a database.
  if (ctx.cwd !== process.cwd()) process.chdir(ctx.cwd);

  const handler: PlumixHandler = createRuntimeHandler(ctx.app);
  if (handler.run === undefined) {
    throw PlumixCliError.metaDatabaseUnreachable({
      detail: "this runtime's handler can't run work outside a request",
      cause: undefined,
    });
  }
  // Only a failure before the sweep starts means the database was unreachable
  // (a D1 binding exists only inside the Worker).
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
    throw PlumixCliError.metaDatabaseUnreachable({
      detail: messageOf(cause),
      cause,
    });
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

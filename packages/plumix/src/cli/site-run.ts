import type {
  AppContext,
  CommandContext,
  PlumixApp,
  PlumixHandler,
  RunEnvironment,
  TargetOptionValues,
} from "@plumix/core";
import { loadOnce } from "@plumix/core/support";

import type { PlumixCliError } from "./errors.js";
import { report } from "./report.js";

/**
 * Dynamic: the static graph of `src/cli/index.ts` must not put core's root
 * barrel on every `plumix` invocation.
 */
const loadCore = loadOnce(() => import("@plumix/core"));

/** One `handler.run` of the work, against the env the runtime opened. */
export type SiteRun = <T>(work: (ctx: AppContext) => Promise<T>) => Promise<T>;

interface SiteRunOptions {
  readonly binding: string | undefined;
  readonly targetValues: TargetOptionValues;
  /** The command's error for a database the run could not reach. */
  readonly unreachable: (ctx: {
    detail: string;
    cause: unknown;
  }) => PlumixCliError;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs through the site's own handler so the database, mailer and CDN purges
 * are the site's, not a reimplementation.
 */
export async function withSiteRun(
  ctx: CommandContext<PlumixApp>,
  options: SiteRunOptions,
  work: (run: SiteRun, opened: RunEnvironment) => Promise<void>,
): Promise<void> {
  const { createRuntimeHandler } = await loadCore();

  // `nodeSqlite` resolves its path against the process cwd, so `--cwd` has to
  // land before anything opens a database.
  if (ctx.cwd !== process.cwd()) process.chdir(ctx.cwd);

  const handler: PlumixHandler = createRuntimeHandler(ctx.app);
  const { run } = handler;
  if (run === undefined) {
    throw options.unreachable({
      detail: "this runtime's handler can't run work outside a request",
      cause: undefined,
    });
  }
  const runtime = ctx.runtimeMigrations;
  if (runtime === undefined) {
    throw options.unreachable({
      detail: `the ${ctx.app.config.runtime.name} runtime does not say how to open its database from the command line`,
      cause: undefined,
    });
  }
  const opened = await runtime.openRun({
    cwd: ctx.cwd,
    config: ctx.app.config,
    binding: options.binding,
    targetValues: options.targetValues,
  });
  const siteRun: SiteRun = async (runWork) => {
    // Only a failure before the work starts means the database was
    // unreachable.
    const phase = { started: false };
    try {
      return await run(
        (appCtx) => {
          phase.started = true;
          return runWork(appCtx);
        },
        { env: opened.env },
      );
    } catch (cause) {
      if (phase.started) throw cause;
      throw options.unreachable({ detail: messageOf(cause), cause });
    }
  };
  try {
    await work(siteRun, opened);
  } finally {
    // Deferred work — the CDN purges a settle enqueued — is still running
    // until `dispose()` returns.
    try {
      await handler.dispose?.();
    } catch (error) {
      report.detail(`Could not drain the handler: ${messageOf(error)}`);
    }
    await opened.close();
  }
}

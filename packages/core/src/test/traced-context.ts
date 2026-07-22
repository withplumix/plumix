import type { AppContext } from "../context/app.js";
import type { CreateDispatcherHarnessOptions } from "./dispatcher.js";
import { createAppContext } from "../context/app.js";
import { requestStore } from "../context/stores.js";
import { createDispatcherHarness } from "./dispatcher.js";

export interface TracedContext {
  readonly harness: Awaited<ReturnType<typeof createDispatcherHarness>>;
  readonly ctx: AppContext;
  /** Run `fn` with `ctx` in the ambient request store so DB spans attribute to it. */
  readonly run: <T>(fn: () => Promise<T>) => Promise<T>;
  /** Number of `db:` spans collected so far — one per query. */
  readonly dbQueryCount: () => number;
}

/**
 * A dispatcher harness plus a standalone request context with telemetry
 * sampled on — for unit tests that assert how many queries a service
 * function issues (request-memo coverage, N+1 guards).
 */
export async function createTracedContext(
  options?: CreateDispatcherHarnessOptions,
): Promise<TracedContext> {
  const harness = await createDispatcherHarness(options);
  const ctx = createAppContext({
    db: harness.db,
    env: harness.env,
    request: new Request("https://cms.example/"),
    hooks: harness.app.hooks,
    plugins: harness.app.plugins,
    telemetry: {
      consumers: [{ id: "traced-context", onRequestEnd: () => undefined }],
    },
  });
  return {
    harness,
    ctx,
    run: (fn) => requestStore.run(ctx, fn),
    dbQueryCount: () =>
      ctx.telemetry.getSpans().filter((s) => s.name.startsWith("db:")).length,
  };
}

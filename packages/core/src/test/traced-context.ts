import type { AppContext } from "../context/app.js";
import type { TelemetrySpan } from "../context/telemetry.js";
import type {
  CreateDispatcherHarnessOptions,
  DispatcherHarness,
} from "./dispatcher.js";
import { requestStore } from "../context/stores.js";
import { createTestContext } from "./context.js";
import { createDispatcherHarness } from "./dispatcher.js";

export interface TracedContext {
  readonly harness: DispatcherHarness;
  readonly ctx: AppContext;
  /** Run `fn` with `ctx` in the ambient request store so DB spans attribute to it. */
  readonly run: <T>(fn: () => Promise<T>) => Promise<T>;
  /** The `db:` spans collected so far — one per driver-level query. */
  readonly dbSpans: () => readonly TelemetrySpan[];
  /** How many of them there are, for a test that only counts queries. */
  readonly dbQueryCount: () => number;
}

/**
 * A dispatcher harness plus a standalone request context with telemetry
 * sampled on — for unit tests that assert how many queries a service
 * function issues (request-memo coverage, N+1 guards).
 */
export async function createTracedContext(
  options: CreateDispatcherHarnessOptions = {},
): Promise<TracedContext> {
  const harness = await createDispatcherHarness(options);
  const ctx = createTestContext({
    db: harness.db,
    env: harness.env,
    clientAddress: options.clientAddress,
    hooks: harness.app.hooks,
    plugins: harness.app.plugins,
    telemetry: {
      consumers: [{ id: "traced-context", onRequestEnd: () => undefined }],
    },
  });
  const dbSpans = (): readonly TelemetrySpan[] =>
    ctx.telemetry.getSpans().filter((span) => span.name.startsWith("db:"));
  return {
    harness,
    ctx,
    run: (fn) => requestStore.run(ctx, fn),
    dbSpans,
    dbQueryCount: () => dbSpans().length,
  };
}

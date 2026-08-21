import type {
  AppContext,
  CoreSchema,
  CreateAppContextArgs,
  Db,
  Logger,
} from "../context/app.js";
import { createAppContext } from "../context/app.js";
import { HookRegistry } from "../hooks/registry.js";
import { createPluginRegistry } from "../plugin/manifest.js";

/**
 * Any drizzle database a test hands the factory — the core schema, or a
 * plugin schema layered on top of it. Query builders take the table they
 * operate on as an argument, so a plugin's own tables resolve at runtime
 * through a context whose type only knows the core schema.
 */
type TestContextDb = Db<Record<string, unknown>>;

export interface CreateTestContextOptions extends Partial<
  Omit<CreateAppContextArgs<CoreSchema>, "db">
> {
  readonly db: TestContextDb;
}

const noop = (): void => undefined;

/** Keeps harness output out of test logs; override to assert on logging. */
export const silentLogger: Logger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
};

/**
 * A real `AppContext` for tests that exercise a service function directly
 * rather than through a request. Everything a handler reads through — the
 * request memo, the capability resolver, the hook executor, `defer` — is
 * the production implementation rather than an omission the test has to
 * work around.
 *
 * The default `defer` is fire-and-forget with no drain handle; a test that
 * asserts on deferred work should pass `createDeferQueue().defer`. For a
 * full request pipeline use `createDispatcherHarness` instead.
 */
export function createTestContext(
  options: CreateTestContextOptions,
): AppContext {
  const { db, ...overrides } = options;
  return createAppContext({
    ...overrides,
    // Defaulted with `??` rather than by spread order: an explicitly-passed
    // `undefined` would otherwise overwrite the default and blow up inside
    // `createAppContext`, which has no fallback for these four.
    env: overrides.env ?? {},
    request: overrides.request ?? new Request("https://cms.example/"),
    hooks: overrides.hooks ?? new HookRegistry(),
    plugins: overrides.plugins ?? createPluginRegistry(),
    logger: overrides.logger ?? silentLogger,
    // Asserted, not checked — see `TestContextDb`.
    db: db as Db,
  });
}

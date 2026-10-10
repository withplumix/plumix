import type {
  AppContext,
  CoreSchema,
  Db,
  Logger,
} from "../context/app-context.js";
import type { CreateAppContextArgs } from "../context/app.js";
import type { TestConfigInput } from "./config.js";
import { createAppContext } from "../context/app.js";
import { HookRegistry } from "../hooks/registry.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { testConfig } from "./config.js";

/**
 * Any drizzle database: query builders take their table as an argument, so
 * plugin tables resolve at runtime through a context typed for the core schema.
 */
type TestContextDb = Db<Record<string, unknown>>;

export interface CreateTestContextOptions extends Partial<
  Omit<CreateAppContextArgs<CoreSchema>, "db" | "config">
> {
  readonly db: TestContextDb;
  /** Config slots, resolved through `plumix()` into the context's `config`. */
  readonly config?: TestConfigInput;
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
 * A real `AppContext` for calling a service directly, with production memo,
 * capabilities, hooks and `defer`. Pass `createDeferQueue().defer` to assert on
 * deferred work.
 */
export function createTestContext(
  options: CreateTestContextOptions,
): AppContext {
  const { db, config, ...overrides } = options;
  return createAppContext({
    ...overrides,
    config: testConfig(config),
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

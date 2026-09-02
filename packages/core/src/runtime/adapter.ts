import type { PlumixApp } from "./app.js";
import type { PlumixEnv } from "./bindings.js";

/**
 * What the runtime knows about one call into the handler. An adapter builds
 * it from its platform's serve API — the Worker's positional `(env, ctx)`,
 * a `Bun.serve` request, a Lambda event — so core never sees the platform
 * shape.
 */
export interface Invocation {
  /** The runtime's configuration bag: bindings, secrets and plain vars. */
  readonly env: PlumixEnv;
  /**
   * Keep the runtime alive until the promise settles. Deferred work (telemetry
   * delivery, cache purges) routes through it when supplied; without it the
   * work is fire-and-forget.
   */
  readonly waitUntil?: (promise: Promise<unknown>) => void;
  /**
   * The client address as the runtime's trusted proxy reports it. Carried on
   * the contract so the adapter that knows its proxy supplies the value and
   * core never parses a forwarding header (#2171).
   */
  readonly clientAddress?: string;
}

export interface ScheduledEvent {
  readonly scheduledTime: number;
  readonly cron: string;
}

/**
 * The one object a runtime adapter produces; the entry hands it every call.
 * Property functions rather than methods, so an adapter cannot narrow the
 * invocation it accepts and still conform.
 */
export interface PlumixHandler {
  readonly fetch: (
    request: Request,
    invocation: Invocation,
  ) => Response | Promise<Response>;
  readonly scheduled?: (
    event: ScheduledEvent,
    invocation: Invocation,
  ) => void | Promise<void>;
}

export interface CommandContext {
  readonly app: PlumixApp;
  readonly cwd: string;
  readonly configPath: string;
  readonly argv: readonly string[];
  /**
   * Subcommands the active runtime contributes to the built-in `migrate`
   * verb. The CLI populates this from the runtime's commands module
   * (`export const migrate: CommandRegistry`); `migrate apply` delegates
   * here so D1-/Postgres-/etc.-specific apply logic lives with its
   * runtime.
   */
  readonly runtimeMigrate: CommandRegistry;
}

export interface CommandDefinition {
  readonly describe: string;
  /**
   * Skip the CLI's eager, Node-side `buildApp` and hand the command a throwing
   * `ctx.app` sentinel instead. Set by commands that construct the app in their
   * own runtime rather than consuming the pre-built one — `dev`, whose worker
   * builds the app itself, so a config/registration failure surfaces through the
   * worker's dev boot-error page in the browser instead of rejecting in Node and
   * aborting the terminal before the dev server is listening. Left unset by
   * `build`/`deploy`, where the eager build doubles as fail-fast config
   * validation before a bundle ships.
   */
  readonly deferApp?: boolean;
  run(ctx: CommandContext): Promise<void> | void;
}

export type CommandRegistry = Readonly<Record<string, CommandDefinition>>;

export interface RuntimeAdapter {
  readonly name: string;
  /**
   * Produce the handler the entry calls. Most adapters return
   * `createPlumixHandler(app, …)` from core and add only what their platform
   * knows: the Cloudflare adapter contributes the `ASSETS` binding read.
   */
  createHandler(app: PlumixApp): PlumixHandler;
  /**
   * Module specifiers whose named exports must be re-exported from the
   * generated Worker entry. Cloudflare requires a Durable Object class to
   * be a named export of the entry module, but that entry is codegen'd from
   * a fixed template — so a DO-backed feature contributes its class module
   * here, and the plumix Vite plugin surfaces it through the
   * `virtual:plumix/worker-exports` module. Omit when the runtime
   * contributes no worker-level exports (the common case).
   */
  readonly workerExports?: readonly string[];
  /**
   * Module specifier imported by the CLI to load runtime-contributed
   * commands. Kept out of the worker-facing adapter so dev/build/deploy
   * tooling never ends up in the worker bundle.
   */
  readonly commandsModule?: string;
}

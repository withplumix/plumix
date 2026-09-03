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
   * delivery, cache purges) routes through it when supplied; an adapter that
   * omits it owes its platform a {@link PlumixHandler.dispose} call at
   * shutdown instead.
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
  /**
   * Drain the deferred work no `waitUntil` took. A long-lived process calls it
   * on `SIGTERM` so telemetry delivery and cache purges finish instead of
   * dying with the process; a runtime whose invocations carry `waitUntil` has
   * nothing to drain and resolves at once.
   *
   * Bounded, and the bound is absolute: work still unsettled after
   * `disposeTimeoutMs` (five seconds by default) is abandoned rather than
   * held onto, so a stuck task cannot keep a shutdown open.
   */
  readonly dispose?: () => Promise<void>;
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

/** What the build tells an adapter about the site it is generating an entry for. */
export interface EntrySourceOptions {
  /**
   * Specifier the entry imports the user's `plumix.config.ts` from, relative
   * to the emitted module. Interpolate it through `JSON.stringify` — a project
   * path can carry spaces or quotes.
   */
  readonly configModule: string;
}

export interface RuntimeAdapter {
  readonly name: string;
  /**
   * Produce the handler the entry calls. Most adapters return
   * `createPlumixHandler(app, …)` from core and add only what their platform
   * knows: the Cloudflare adapter contributes the `ASSETS` binding read.
   */
  createHandler(app: PlumixApp): PlumixHandler;
  /**
   * Source of the entry module the build serves — the few lines that adapt the
   * platform's serve API to {@link PlumixHandler}: a Workers default export,
   * `Bun.serve`, a `node:http` bridge, a Lambda handler. The plumix Vite
   * plugin pre-emits it, so the entry may import `virtual:plumix/*` modules
   * the plugin resolves.
   *
   * Unlike {@link RuntimeAdapter.commandsModule}, this is a live function on
   * the adapter the config constructs, so it is reachable from the serving
   * bundle and everything it imports is bundled with it. Build the source from
   * literals; a `node:*` import at module scope here is a load-time failure on
   * a runtime that has no Node built-ins.
   */
  generateEntry(options: EntrySourceOptions): string;
  /**
   * Module specifiers whose named exports must be re-exported from the
   * generated Worker entry. Cloudflare requires a Durable Object class to
   * be a named export of the entry module, but that entry is codegen'd by
   * {@link RuntimeAdapter.generateEntry} — so a DO-backed feature contributes
   * its class module here, and the plumix Vite plugin surfaces it through the
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

import type { PlumixConfig } from "../config.js";
import type { HookRegistry } from "../hooks/registry.js";
import type { RegisteredScheduledTask } from "../plugin/registry.js";
import type { PlumixEnv } from "../runtime/contract/bindings.js";
import type { AssetsBinding } from "../runtime/contract/slots.js";
import type { AppContext } from "./app-context.js";

export interface Invocation {
  /** The runtime's configuration bag: bindings, secrets and plain vars. */
  readonly env: PlumixEnv;
  /**
   * An adapter that omits it must call {@link PlumixHandler.dispose} at
   * shutdown.
   */
  readonly waitUntil?: (promise: Promise<unknown>) => void;
  /**
   * As the runtime's trusted proxy reports it; core never parses a forwarding
   * header.
   */
  readonly clientAddress?: string;
}

export interface DisposeOptions {
  /** Milliseconds to wait for this call, overriding the handler's own bound. */
  readonly timeoutMs?: number;
}

/**
 * What `dispose()` gave up on once its deadline passed; zero when the drain
 * completed.
 */
export interface DisposeResult {
  readonly abandoned: number;
}

export interface ScheduledEvent {
  readonly scheduledTime: number;
  readonly cron: string;
}

/**
 * Task failures are caught so siblings run; this report is how an outside
 * caller tells success from failure. A union, so "aborted means nothing ran"
 * is compiler-checked.
 */
export type ScheduledRunReport =
  | {
      /** How many tasks completed without throwing. */
      readonly ran: number;
      /** `plugin:task` for each that threw, in the order they ran. */
      readonly failed: readonly string[];
      /**
       * Declared so the key is known to both arms: excess-property checking
       * would otherwise let an aborted report pass as this one.
       */
      readonly aborted?: never;
    }
  | {
      readonly ran: 0;
      readonly failed: readonly [];
      /**
       * Why the run never reached its tasks, such as a database that will not
       * connect.
       */
      readonly aborted: string;
    };

/**
 * Property functions rather than methods, so an adapter cannot narrow the
 * invocation it accepts and still conform.
 */
export interface PlumixHandler {
  readonly fetch: (
    request: Request,
    invocation: Invocation,
  ) => Response | Promise<Response>;
  /**
   * Returning nothing conforms; the caller then knows only that the run was
   * attempted.
   */
  readonly scheduled?: (
    event: ScheduledEvent,
    invocation: Invocation,
  ) => void | Promise<void | ScheduledRunReport>;
  /**
   * Runs work outside a request with a request's context, committing and
   * flushing purges like one. Throws when the database is unreachable from
   * here, like D1 from Node.
   */
  readonly run?: <T>(
    work: (ctx: AppContext) => Promise<T>,
    invocation: Invocation,
  ) => Promise<T>;
  /**
   * Drains deferred work no `waitUntil` took, abandoning what outlasts the
   * deadline, then releases the database. Not terminal: a later `fetch`
   * reconnects.
   */
  readonly dispose?: (options?: DisposeOptions) => Promise<DisposeResult>;
}

/**
 * The CLI hands over the whole app; a command needing more declares it via
 * {@link CommandDefinition}'s type parameter.
 */
export interface CommandApp {
  readonly config: PlumixConfig;
  readonly hooks: HookRegistry;
  readonly scheduledTasks: readonly RegisteredScheduledTask[];
}

export interface CommandContext<App extends CommandApp = CommandApp> {
  readonly app: App;
  readonly cwd: string;
  readonly configPath: string;
  readonly argv: readonly string[];
  /**
   * From the runtime's commands module; absent when the runtime declares none.
   */
  readonly runtimeMigrations?: RuntimeMigrations;
}

/** One owner's history, as drizzle's migrator takes it. */
export interface MigrationFolder {
  readonly migrationsFolder: string;
  readonly migrationsTable: string;
}

/**
 * Which database `plumix migrate` opens: the one `plumix dev` uses, the
 * deployed one (`--remote`), or a scratch database in memory that adoption
 * builds every owner's history into to compare against.
 */
export type MigrationLocation = "local" | "remote" | "memory";

export interface OpenMigrationDatabaseOptions {
  readonly cwd: string;
  readonly app: CommandApp;
  readonly location: MigrationLocation;
  /** `--binding`, for a runtime that can have more than one database. */
  readonly binding: string | undefined;
}

/**
 * One row a migration read returns, as the driver hands it back: each column
 * name to the SQLite value in it. Not JSON — it never went through a parser.
 */
export type MigrationRow = Record<string, unknown>;

export interface MigrationStatement {
  readonly sql: string;
  readonly params: readonly (string | number)[];
}

/**
 * A database opened for migration. `migrate` is drizzle's own migrator for
 * the runtime's driver; the rest is what the CLI reads to report and adopt.
 */
export interface MigrationDatabase {
  migrate(folder: MigrationFolder): Promise<void>;
  all(sql: string): Promise<readonly MigrationRow[]>;
  /** Runs every statement, or none of them. */
  batch(statements: readonly MigrationStatement[]): Promise<void>;
  close(): Promise<void>;
}

/**
 * What a runtime supplies to `plumix migrate`: only how to open its database.
 * Which histories apply, in what order, adoption and reporting live in the CLI.
 */
export interface RuntimeMigrations {
  /** Whether `--remote` names a database this runtime can reach. */
  readonly remote: boolean;
  /**
   * The tracking table of a site's legacy single history (`drizzle/`), which
   * marks a database to adopt.
   */
  readonly legacyTable: string;
  open(options: OpenMigrationDatabaseOptions): Promise<MigrationDatabase>;
}

export interface CommandDefinition<App extends CommandApp = CommandApp> {
  readonly describe: string;
  /**
   * Skips the eager Node-side `buildApp`; `ctx.app` then throws. For commands
   * that build the app in their own runtime, so failures surface there.
   */
  readonly deferApp?: boolean;
  run(ctx: CommandContext<App>): Promise<void> | void;
}

export type CommandRegistry = Readonly<Record<string, CommandDefinition>>;

/**
 * What the build tells an adapter about the site it is generating an entry for.
 */
export interface EntrySourceOptions {
  /**
   * Specifier the entry imports the user's `plumix.config.ts` from, relative
   * to the emitted module. Interpolate it through `JSON.stringify` — a project
   * path can carry spaces or quotes.
   */
  readonly configModule: string;
}

/** Only the reads a platform can answer; core composes the handler itself. */
export interface RuntimeHandlerSpec {
  /**
   * Resolve the static-asset fetcher for an invocation. Without one the admin
   * SPA answers `admin-not-available`.
   */
  readonly assets?: (env: PlumixEnv) => AssetsBinding | undefined;
  /** How long `dispose()` waits for deferred work; five seconds by default. */
  readonly disposeTimeoutMs?: number;
  /** Replaces the invocation's address, even when it returns undefined. */
  readonly clientAddress?: (request: Request) => string | undefined;
  /**
   * One-off setup, run once per handler before its first request: a platform
   * check that fails fast, or dev error hints registered on the app's hooks.
   */
  readonly prepare?: (hooks: HookRegistry) => void;
  /**
   * Platform routing in front of the site; gets the config because support can
   * depend on other slots.
   */
  readonly wrap?: (
    handler: PlumixHandler,
    config: PlumixConfig,
  ) => PlumixHandler;
}

/**
 * Refusable whatever the role; the admin hides every surface of a refused area.
 */
export type AdminArea =
  | "apiTokens"
  | "deviceAuthorization"
  | "passkeys"
  | "oauthLinking"
  | "emailDelivery";

export interface RuntimeAdapter {
  readonly name: string;
  /**
   * How core builds the handler the entry calls; see {@link
   * RuntimeHandlerSpec}.
   */
  readonly handler: RuntimeHandlerSpec;
  /**
   * Bundled with the server, so build the source from literals: a module-scope
   * `node:*` import fails on runtimes without Node built-ins. The entry may
   * import `virtual:plumix/*`.
   */
  generateEntry(options: EntrySourceOptions): string;
  /**
   * Modules re-exported from the generated entry, because Cloudflare requires a
   * Durable Object class to be a named export of the entry module.
   */
  readonly workerExports?: readonly string[];
  /**
   * A specifier, not a module, so CLI tooling never lands in the worker bundle.
   */
  readonly commandsModule?: string;
  /** Refused whoever is signed in; the admin hides their surfaces. */
  readonly refusedAdminAreas?: readonly AdminArea[];
}

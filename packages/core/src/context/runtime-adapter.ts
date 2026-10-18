import type { PlumixConfig } from "../config.js";
import type { HookRegistry } from "../hooks/registry.js";
import type { RegisteredScheduledTask } from "../plugin/registry.js";
import type { PlumixEnv } from "../runtime/contract/bindings.js";
import type { AssetsBinding } from "../runtime/contract/slots.js";
import type { AppContext, DataMigrationDb } from "./app-context.js";

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
   * flushing purges like one. Throws when the database is unreachable through
   * the invocation's env, like D1 missing from `process.env`.
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
  /**
   * From the runtime's commands module; absent when the runtime declares none.
   */
  readonly runtimeDiagnose?: RuntimeDiagnose;
  /**
   * From the runtime's commands module; absent when the runtime declares none.
   */
  readonly runtimeSync?: RuntimeSync;
}

/** One thing `plumix doctor` reports about how a project will deploy. */
export interface DiagnosticFinding {
  readonly level: "ok" | "warn";
  readonly message: string;
  /** What to change so a `warn` becomes `ok`. */
  readonly fix?: string;
}

/**
 * What a runtime's commands module supplies to `plumix doctor`: the findings
 * its deploy config in `cwd` gives rise to.
 */
export type RuntimeDiagnose = (cwd: string) => readonly DiagnosticFinding[];

/** One owner's history, as drizzle's migrator takes it. */
export interface MigrationFolder {
  readonly migrationsFolder: string;
  readonly migrationsTable: string;
}

/**
 * An option a runtime adds to `plumix migrate`, `sync` and `import` to name
 * which of its databases a command reaches, parsed as `node:util`'s
 * `parseArgs` parses it.
 */
export interface RuntimeTargetOption {
  readonly type: "boolean" | "string";
  /** One line for `plumix --help`. */
  readonly description: string;
}

/** Each target option a runtime accepts, by its flag name without `--`. */
export type RuntimeTargetOptions = Readonly<
  Record<string, RuntimeTargetOption>
>;

/** The target options a command was given, each by its flag name. */
export type TargetOptionValues = Readonly<
  Record<string, string | boolean | undefined>
>;

/**
 * The site's database, which the target options name (the local one without
 * any), or a scratch database in memory that adoption compares against.
 */
export type MigrationLocation = "site" | "memory";

export interface OpenMigrationDatabaseOptions {
  readonly cwd: string;
  readonly config: PlumixConfig;
  readonly location: MigrationLocation;
  /** `--binding`, for a runtime that can have more than one database. */
  readonly binding: string | undefined;
  readonly targetValues: TargetOptionValues;
}

/** Which database a command opened, as the CLI shows it before it writes. */
export interface MigrationDatabaseTarget {
  /** A deployed database, which the CLI confirms before writing to. */
  readonly remote: boolean;
  /** One line naming the database and how it was chosen. */
  readonly summary: string;
  /** Lines a plan shows under the summary. */
  readonly notes: readonly string[];
  /** The database's own name, apart from the `summary` line that locates it. */
  readonly name: string;
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
  /** drizzle over the same driver, with no schema: a data migration's `db`. */
  readonly drizzle: DataMigrationDb;
  all(sql: string): Promise<readonly MigrationRow[]>;
  /** Runs every statement, or none of them. */
  batch(statements: readonly MigrationStatement[]): Promise<void>;
  /**
   * Drops every table but the engine's own, tracking tables included, with
   * foreign-key checks suspended.
   */
  wipe(): Promise<void>;
  /**
   * One line naming where the database can be restored to as it is now, and
   * the command that restores it, for a database its platform keeps one of.
   */
  restorePoint?(): Promise<string>;
  close(): Promise<void>;
  readonly target: MigrationDatabaseTarget;
}

/**
 * Only how a runtime opens its database: which histories apply, their order,
 * adoption and reporting live in the CLI.
 */
export interface RuntimeMigrations {
  /** The options that name a database other than the local one. */
  readonly targetOptions?: RuntimeTargetOptions;
  /**
   * The tracking table of a site's legacy single history (`drizzle/`), which
   * marks a database to adopt.
   */
  readonly legacyTable: string;
  open(options: OpenMigrationDatabaseOptions): Promise<MigrationDatabase>;
  /**
   * The env a `handler.run` from the CLI reaches the same database through,
   * for `plumix meta`.
   */
  openRun(options: OpenRunOptions): Promise<RunEnvironment>;
}

export type OpenRunOptions = Omit<OpenMigrationDatabaseOptions, "location">;

/** The env one command run hands `handler.run`, until it closes. */
export interface RunEnvironment {
  /**
   * The process env, with every binding the site's slots read over it, opened
   * against the database the target options name.
   */
  readonly env: PlumixEnv;
  readonly target: MigrationDatabaseTarget;
  close(): Promise<void>;
}

/** A table owner whose history applies to a site (ADR 0027). */
export interface MigrationOwner extends MigrationFolder {
  /** `core`, `site`, or the package name. */
  readonly name: string;
}

/** Which end of a sync: the database `plumix dev` uses, or the deployed one. */
export type SyncTarget = "local" | "remote";

/** `pull` copies the remote end into the local one; `push` the reverse. */
export type SyncDirection = "pull" | "push";

export interface OpenSyncEndOptions {
  readonly cwd: string;
  readonly config: PlumixConfig;
  readonly target: SyncTarget;
  /** `--binding`, for a runtime that can have more than one database. */
  readonly binding: string | undefined;
  /** `--url`: the remote site's origin. Set whenever `target` is `remote`. */
  readonly url: string | undefined;
  /** In application order; {@link SyncEnd.heads} reads each one's head. */
  readonly owners: readonly MigrationOwner[];
  readonly targetValues: TargetOptionValues;
}

/** One table a scope selects: the whole table unless `where` narrows it. */
export interface SyncScopeTable {
  readonly table: string;
  /** SQL Plumix wrote, never input. */
  readonly where?: string;
}

/**
 * What a sync replaces, named as `--scope` names it. `media` selects the
 * storage slot's objects rather than tables.
 */
export interface SyncScope {
  readonly name: string;
  /** In load order: parents before the rows that reference them. */
  readonly tables: readonly SyncScopeTable[];
}

/** A SQLite value as a sync carries it; a BLOB is its bytes. */
export type SyncValue = string | number | null | Uint8Array;

/** One row, each column name to its value. */
export type SyncRow = Readonly<Record<string, SyncValue>>;

/** Where a sync end exports to. Each call completes before the next starts. */
export interface DumpWriter {
  table(name: string, rows: AsyncIterable<SyncRow>): Promise<void>;
  /**
   * The users the dump's rows reference, written only when `users` is not
   * among the scopes: `id`, `email`, `slug`, `name`, `avatar_url`, `role`.
   */
  authors(rows: AsyncIterable<SyncRow>): Promise<void>;
  object(
    key: string,
    body: ReadableStream<Uint8Array>,
    contentType?: string,
  ): Promise<void>;
}

export interface DumpTableCount {
  readonly name: string;
  readonly rows: number;
}

/** A dump's `manifest.json`. */
export interface DumpManifest {
  readonly format: 1;
  readonly source: { readonly origin: string; readonly basePath: string };
  readonly scopes: readonly string[];
  /** In load order. */
  readonly tables: readonly DumpTableCount[];
  readonly authors: number;
  readonly objects: number;
  /** Each owner's newest applied migration, as {@link SyncEnd.heads} reads it. */
  readonly heads: Readonly<Record<string, string | null>>;
}

export interface SyncObject {
  readonly key: string;
  readonly contentType?: string;
  readonly body: ReadableStream<Uint8Array>;
}

export interface DumpReader {
  readonly manifest: DumpManifest;
  rows(table: string): AsyncIterable<SyncRow>;
  authors(): AsyncIterable<SyncRow>;
  objects(): AsyncIterable<SyncObject>;
}

/** Rows matched by primary key. */
export interface SyncTableReport {
  readonly table: string;
  readonly replaced: number;
  readonly added: number;
  readonly removed: number;
}

/** Rows outside the sync that referenced rows it replaced. */
export interface SyncDependentReport {
  readonly table: string;
  readonly removed: number;
  /** Rows kept with the reference set to null. */
  readonly cleared: number;
}

export interface SyncImportReport {
  readonly tables: readonly SyncTableReport[];
  readonly dependents: readonly SyncDependentReport[];
  /** Emails of the authors added as disabled users. */
  readonly authorsAdded: readonly string[];
}

/** What a transport needs to restore the target as it was before a push. */
export interface SyncSnapshot {
  readonly id: string;
}

export interface SyncAfterEvent {
  readonly scopes: readonly string[];
  readonly direction: SyncDirection;
}

export interface SyncSettleFailure {
  /** `plugin:<id>`, `core` or `cdn`. */
  readonly step: string;
  readonly message: string;
}

export interface SyncSettleReport {
  /** `failed` when `purgeAll` threw; that failure is also in `failures`. */
  readonly cdn: "purged" | "cannot-purge" | "failed" | "none";
  readonly failures: readonly SyncSettleFailure[];
}

/** One end of a sync, opened for one command run. */
export interface SyncEnd {
  /** Remote: `url`. Local: `auth.passkey.origin` resolved against the local env. */
  readonly origin: string;
  heads(): Promise<Readonly<Record<string, string | null>>>;
  exportData(scopes: readonly SyncScope[], into: DumpWriter): Promise<void>;
  /**
   * Replaces what the scopes select with the dump's rows. Throws
   * `sync_migrations_differ` before any write when the dump's heads differ.
   */
  importData(
    from: DumpReader,
    scopes: readonly SyncScope[],
    options: { readonly dryRun: boolean },
  ): Promise<SyncImportReport>;
  snapshot(): Promise<SyncSnapshot>;
  restoreHint(snapshot: SyncSnapshot): string;
  /** Runs core's `settleSync` inside the target site; never throws for a failed step. */
  settle(event: SyncAfterEvent): Promise<SyncSettleReport>;
  close(): Promise<void>;
}

/**
 * How a runtime moves a site's data for `plumix sync`. A commands-module
 * export, not an adapter member: a transport loads CLI tooling the server
 * bundle must not carry.
 */
export interface RuntimeSync {
  /** The options that name which deployed database the remote end reaches. */
  readonly targetOptions?: RuntimeTargetOptions;
  open(options: OpenSyncEndOptions): Promise<SyncEnd>;
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

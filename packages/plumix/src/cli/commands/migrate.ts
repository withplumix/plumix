import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getTableName, is } from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";

import type {
  CommandContext,
  CommandDefinition,
  MigrationDatabase,
  MigrationOwner,
  PlumixConfig,
  RuntimeMigrations,
  TargetOptionValues,
} from "@plumix/core";
import { spawnCapturingStderr } from "@plumix/core/cli";

import type { DataMigrationOwner } from "../migrate/data.js";
import { PlumixCliError } from "../errors.js";
import {
  adoptLegacyDatabase,
  applyOwners,
  reportHistories,
  reportPending,
  reportStatus,
} from "../migrate/apply.js";
import { loadDataMigrations } from "../migrate/data-load.js";
import {
  applyDataMigrations,
  reportDataHistories,
  reportDataPending,
  reportDataStatus,
  withCoreDataMigrations,
} from "../migrate/data.js";
import {
  resolveOwners,
  SITE_SCHEMA_OUT,
  sitePlugins,
  siteRootOf,
} from "../migrate/owners.js";
import { report } from "../report.js";
import { parseCommandArgs } from "../target-options.js";
import { syncDeps } from "./sync.js";

export const migrateCommand: CommandDefinition = {
  describe:
    "Apply each owner's schema then data migrations, or generate the site's",
  async run(ctx) {
    const target = migrationTarget(ctx);
    // `generate` takes no arguments, so it parses none.
    if (ctx.argv[0] === "generate") {
      await migrateGenerate(target);
      return;
    }
    // Before parsing: a runtime that declares no `--production` would
    // otherwise reject it as unknown, not as production.
    if (ctx.argv[0] === "fresh" && namesProduction(ctx.argv)) {
      throw PlumixCliError.migrateFreshProduction();
    }
    const args = parseMigrateArgs(ctx.argv, target);
    if (args.sub === "fresh" && namesProduction(ctx.argv)) {
      throw PlumixCliError.migrateFreshProduction();
    }
    const database = {
      binding: args.binding,
      targetValues: args.targetValues,
    };
    if (args.sub === undefined) {
      await checkSiteDrift(target);
      await withDatabase(target, database, async (db, owners, data, run) => {
        announce(db);
        if (!(await confirmedPlan(db, owners, data, args))) return;
        await adoptAndApply(target, database)(db, owners, data, run);
      });
      return;
    }
    if (args.sub === "fresh") {
      await migrateFresh(target, args);
      return;
    }
    if (args.sub === "status") {
      await withDatabase(target, database, async (db, owners, data) => {
        announce(db);
        await reportStatus(db, owners);
        await reportDataStatus(db, data);
      });
      return;
    }
    throw PlumixCliError.unknownSubcommand({
      command: "migrate",
      subcommand: args.sub,
      supported: ["fresh", "status", "generate"],
    });
  },
};

/** What migrating needs of a command, which `plumix dev` has without an app. */
export interface MigrationTarget {
  readonly cwd: string;
  readonly configPath: string;
  readonly config: PlumixConfig;
  readonly runtimeMigrations: RuntimeMigrations | undefined;
}

function migrationTarget(ctx: CommandContext): MigrationTarget {
  return {
    cwd: ctx.cwd,
    configPath: ctx.configPath,
    config: ctx.app.config,
    runtimeMigrations: ctx.runtimeMigrations,
  };
}

interface MigrateArgs {
  readonly sub: string | undefined;
  readonly binding: string | undefined;
  readonly targetValues: TargetOptionValues;
  readonly dryRun: boolean;
  readonly yes: boolean;
}

function parseMigrateArgs(
  argv: readonly string[],
  target: MigrationTarget,
): MigrateArgs {
  const parsed = parseCommandArgs(argv, {
    command: "migrate",
    runtime: target.config.runtime.name,
    options: {
      binding: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
    },
    targetOptions: target.runtimeMigrations?.targetOptions,
    invalid: (cause) => PlumixCliError.migrateInvalidArguments({ cause }),
  });
  const [sub, extra] = parsed.positionals;
  if (extra !== undefined) {
    throw PlumixCliError.migrateInvalidArguments({
      cause: `Unexpected argument '${extra}'`,
    });
  }
  return {
    sub,
    binding: parsed.values.binding,
    targetValues: parsed.targetValues,
    dryRun: parsed.values["dry-run"],
    yes: parsed.values.yes,
  };
}

/** Which of the runtime's databases a migration opens. */
interface DatabaseChoice {
  readonly binding: string | undefined;
  readonly targetValues: TargetOptionValues;
}

const LOCAL_DATABASE: DatabaseChoice = {
  binding: undefined,
  targetValues: {},
};

function announce(db: MigrationDatabase): void {
  report.info(`→ ${db.target.summary}`);
}

async function reportPlan(
  db: MigrationDatabase,
  owners: readonly MigrationOwner[],
  data: readonly DataMigrationOwner[],
): Promise<void> {
  for (const note of db.target.notes) report.info(`  ${note}`);
  await reportPending(db, owners);
  await reportDataPending(db, data);
}

/**
 * A deployed database is written only once its plan has printed and been
 * confirmed, the rule `plumix sync push` and `plumix import` follow.
 */
async function confirmedPlan(
  db: MigrationDatabase,
  owners: readonly MigrationOwner[],
  data: readonly DataMigrationOwner[],
  args: Pick<MigrateArgs, "dryRun" | "yes">,
): Promise<boolean> {
  if (!db.target.remote && !args.dryRun) return true;
  await reportPlan(db, owners, data);
  if (args.dryRun) {
    report.info("Dry run: nothing was changed.");
    return false;
  }
  if (args.yes) return true;
  if (!syncDeps.isInteractive()) throw PlumixCliError.migrateUnconfirmed();
  const accepted = await syncDeps.confirm(
    `Apply these migrations to ${db.target.summary}?`,
  );
  if (!accepted) report.info("Nothing was changed.");
  return accepted;
}

function runtimeMigrations(target: MigrationTarget): RuntimeMigrations {
  if (target.runtimeMigrations === undefined) {
    throw PlumixCliError.migrateRuntimeUnsupported({
      runtime: target.config.runtime.name,
    });
  }
  return target.runtimeMigrations;
}

/**
 * Owners resolve, and data migrations load, before anything is dropped or
 * opened, so a missing history or module fails with the database untouched.
 */
async function withDatabase(
  target: MigrationTarget,
  database: DatabaseChoice,
  work: MigrationWork,
): Promise<void> {
  const migrations = runtimeMigrations(target);
  const owners = resolveOwners(target.cwd, target.configPath, target.config);
  const data = withCoreDataMigrations(
    await loadDataMigrations(target.cwd, target.configPath, target.config),
  );
  const db = await migrations.open({
    cwd: target.cwd,
    config: target.config,
    location: "site",
    binding: database.binding,
    targetValues: database.targetValues,
  });
  try {
    await work(db, owners, data, migrations);
  } finally {
    await db.close();
  }
}

type MigrationWork = (
  db: MigrationDatabase,
  owners: readonly MigrationOwner[],
  data: readonly DataMigrationOwner[],
  migrations: RuntimeMigrations,
) => Promise<void>;

/** Adoption builds its scratch database through the same runtime, in memory. */
function adoptAndApply(
  target: MigrationTarget,
  database: DatabaseChoice,
): MigrationWork {
  return async (db, owners, data, migrations) => {
    await adoptLegacyDatabase(
      db,
      owners,
      siteTables(target),
      migrations.legacyTable,
      () =>
        migrations.open({
          cwd: target.cwd,
          config: target.config,
          location: "memory",
          binding: database.binding,
          targetValues: database.targetValues,
        }),
    );
    await applyOwners(db, owners);
    await applyDataMigrations(db, data);
  };
}

function siteTables(target: MigrationTarget): readonly string[] {
  return sitePlugins(target.cwd, target.configPath, target.config).flatMap(
    (plugin) =>
      Object.values(plugin.schema ?? {}).flatMap((value) =>
        is(value, SQLiteTable) ? [getTableName(value)] : [],
      ),
  );
}

async function migrateFresh(
  target: MigrationTarget,
  args: MigrateArgs,
): Promise<void> {
  await checkSiteDrift(target);
  const database = { binding: args.binding, targetValues: args.targetValues };
  await withDatabase(target, database, async (db, owners, data) => {
    announce(db);
    if (!(await confirmedWipe(db, owners, data, args))) return;
    if (db.restorePoint !== undefined) report.info(await db.restorePoint());
    await db.wipe();
    await applyOwners(db, owners);
    await applyDataMigrations(db, data);
    report.info("Load data with `plumix import` or `plumix sync push`.");
  });
}

/** `--production` or `--env production`. */
function namesProduction(argv: readonly string[]): boolean {
  return argv.some(
    (arg, i) =>
      arg === "--production" ||
      arg.startsWith("--production=") ||
      arg === "--env=production" ||
      (arg === "--env" && argv[i + 1] === "production"),
  );
}

const TABLES_SQL =
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY name";

async function reportWipePlan(
  db: MigrationDatabase,
  owners: readonly MigrationOwner[],
  data: readonly DataMigrationOwner[],
): Promise<void> {
  for (const note of db.target.notes) report.info(`  ${note}`);
  const tables = (await db.all(TABLES_SQL)).map((row) => String(row.name));
  if (tables.length === 0) {
    report.info("Drops no tables: the database is empty.");
  } else {
    report.info(
      `Drops ${String(tables.length)} table${tables.length === 1 ? "" : "s"}:`,
    );
    for (const table of tables) report.info(`  ${table}`);
  }
  report.info("Then applies:");
  reportHistories(owners);
  reportDataHistories(data);
}

async function confirmedWipe(
  db: MigrationDatabase,
  owners: readonly MigrationOwner[],
  data: readonly DataMigrationOwner[],
  args: Pick<MigrateArgs, "dryRun" | "yes">,
): Promise<boolean> {
  await reportWipePlan(db, owners, data);
  if (args.dryRun) {
    report.info("Dry run: nothing was dropped.");
    return false;
  }
  if (args.yes) return true;
  if (!syncDeps.isInteractive()) throw PlumixCliError.migrateFreshUnconfirmed();
  if (db.target.remote) {
    const typed = await syncDeps.ask(
      `Type ${db.target.name} to drop every table in ${db.target.summary}:`,
    );
    if (typed.trim() !== db.target.name) {
      throw PlumixCliError.migrateFreshNameMismatch({ name: db.target.name });
    }
    return true;
  }
  const accepted = await syncDeps.confirm(
    `Drop every table in ${db.target.summary} and migrate it from nothing?`,
  );
  if (!accepted) report.info("Nothing was dropped.");
  return accepted;
}

function siteSchemaModules(target: MigrationTarget): readonly string[] {
  return [
    ...new Set(
      sitePlugins(target.cwd, target.configPath, target.config).flatMap(
        (plugin) => plugin.schemaModule ?? [],
      ),
    ),
  ];
}

function siteMigrationsDir(target: MigrationTarget): string {
  return join(siteRootOf(target.configPath), "migrations");
}

function filesUnder(dir: string): Set<string> {
  if (!existsSync(dir)) return new Set();
  return new Set(
    readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => relative(dir, join(entry.parentPath, entry.name))),
  );
}

/** The migrations drizzle-kit wrote into `out`, a history of the site's own tables. */
async function generateSiteMigrations(
  target: MigrationTarget,
  modules: readonly string[],
  out: string,
): Promise<readonly string[]> {
  writeSiteSchema(target.cwd, modules);
  const before = filesUnder(out);
  await runDrizzleKitGenerate(target.cwd, relative(target.cwd, out));
  return [...filesUnder(out)]
    .filter((file) => file.endsWith(".sql") && !before.has(file))
    .sort();
}

/**
 * Generates into a copy of the site's history, so a site whose tables are
 * ahead of it fails before anything is written or opened.
 */
async function checkSiteDrift(target: MigrationTarget): Promise<void> {
  const modules = siteSchemaModules(target);
  if (modules.length === 0) return;
  const restoreSiteSchema = snapshotSiteSchema(target.cwd);
  try {
    const files = await generateInCopy(target, modules, () => undefined);
    if (files.length > 0) throw PlumixCliError.migrateSiteDrifted({ files });
  } finally {
    restoreSiteSchema();
  }
}

/**
 * Generates into a scratch copy of the site's history, so a generate that
 * fails partway leaves the real one untouched. `keep` runs only on success.
 */
async function generateInCopy(
  target: MigrationTarget,
  modules: readonly string[],
  keep: (copy: string) => void,
): Promise<readonly string[]> {
  const scratch = mkdtempSync(join(tmpdir(), "plumix-generate-"));
  try {
    const history = siteMigrationsDir(target);
    const copy = join(scratch, "migrations");
    if (existsSync(history)) cpSync(history, copy, { recursive: true });
    const files = await generateSiteMigrations(target, modules, copy);
    keep(copy);
    return files;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Returns what puts `.plumix/site-schema.ts` back as it is now. */
function snapshotSiteSchema(cwd: string): () => void {
  const file = resolve(cwd, SITE_SCHEMA_OUT);
  const dir = dirname(file);
  const dirExisted = existsSync(dir);
  const previous = existsSync(file) ? readFileSync(file, "utf8") : null;
  return () => {
    if (!dirExisted) {
      rmSync(dir, { recursive: true, force: true });
      return;
    }
    if (previous === null) rmSync(file, { force: true });
    else writeFileSync(file, previous, "utf8");
  };
}

/**
 * What a runtime's `deploy` runs before it ships: the site's history checked,
 * then its plan printed and every owner applied, unprompted, to the database
 * `targetValues` name.
 */
export async function migrateBeforeDeploy(
  ctx: CommandContext,
  targetValues: TargetOptionValues,
): Promise<void> {
  const site = migrationTarget(ctx);
  const database = { binding: undefined, targetValues };
  await checkSiteDrift(site);
  await withDatabase(site, database, async (db, owners, data, migrations) => {
    announce(db);
    await reportPlan(db, owners, data);
    await adoptAndApply(site, database)(db, owners, data, migrations);
  });
}

/**
 * What `plumix dev` runs before it serves: the site's next migration written
 * when its tables are ahead of its history, then every owner applied locally.
 */
export async function migrateForDev(target: MigrationTarget): Promise<void> {
  if (target.runtimeMigrations === undefined) return;
  const modules = siteSchemaModules(target);
  if (modules.length > 0) {
    const history = siteMigrationsDir(target);
    const files = await generateInCopy(target, modules, (copy) => {
      cpSync(copy, history, { recursive: true });
    });
    if (files.length > 0) {
      const written = files
        .map((file) => relative(target.cwd, join(history, file)))
        .join(", ");
      report.success(`Wrote the site's next migration, ${written}: commit it.`);
    }
  }
  await withDatabase(
    target,
    LOCAL_DATABASE,
    adoptAndApply(target, LOCAL_DATABASE),
  );
}

async function migrateGenerate(target: MigrationTarget): Promise<void> {
  const modules = siteSchemaModules(target);
  if (modules.length === 0) {
    report.info(
      "This site owns no tables: no plugin's schemaModule resolves inside it, so there is nothing to generate.",
    );
    return;
  }
  report.info("Running drizzle-kit generate…");
  await generateSiteMigrations(target, modules, siteMigrationsDir(target));
  report.success(`Schema emitted: ${SITE_SCHEMA_OUT}`);
  report.success(
    `The site's own tables are migrated in ${relative(target.cwd, siteMigrationsDir(target))}/`,
  );
}

async function runDrizzleKitGenerate(cwd: string, out: string): Promise<void> {
  const bin = migrateGenerateDeps.resolveDrizzleKitBin(cwd);
  if (bin === null) {
    throw PlumixCliError.migrateGenerateNoDrizzleKit();
  }
  const stderr = await migrateGenerateDeps.spawnCapturingStderr(
    process.execPath,
    [
      // Same reason as the env below; drizzle-kit's own `console.error`
      // still comes through.
      "--no-warnings",
      bin,
      "generate",
      "--dialect",
      "sqlite",
      // Matches the runtime drizzle config; without it every query fails with
      // `no such column`.
      "--casing",
      "snake_case",
      "--schema",
      SITE_SCHEMA_OUT,
      "--out",
      out,
    ],
    // Failure is read off stderr, so inherited `NODE_OPTIONS`/`NODE_DEBUG`
    // output would read as a failed generate.
    { cwd, env: { NODE_OPTIONS: undefined, NODE_DEBUG: undefined } },
  );
  // A successful generate — including one that finds nothing to do —
  // writes nothing here, so anything at all means it bailed.
  if (stderr.trim() !== "") throw PlumixCliError.migrateGenerateFailed();
}

/**
 * Only the site's own schema modules: core's and every package's tables are
 * in the histories those packages ship.
 */
function writeSiteSchema(cwd: string, modules: readonly string[]): void {
  const source = [
    "// Generated by plumix migrate generate — do not edit.",
    "",
    ...modules.map((spec) => `export * from ${JSON.stringify(spec)};`),
    "",
  ].join("\n");
  const outFile = resolve(cwd, SITE_SCHEMA_OUT);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, source, "utf8");
}

function resolveDrizzleKitBin(cwd: string): string | null {
  // The consumer's drizzle-kit wins so they can pin a version. Its `exports`
  // hide `./bin.cjs`, so walk from the main entry.
  const bases = [
    pathToFileURL(resolve(cwd, "package.json")).href,
    import.meta.url,
  ];
  for (const base of bases) {
    try {
      const main = createRequire(base).resolve("drizzle-kit");
      return resolve(dirname(main), "bin.cjs");
    } catch {
      // try the next base
    }
  }
  return null;
}

/**
 * Mutable seam for tests — substitute the collaborator, not the module path.
 */
export const migrateGenerateDeps = {
  resolveDrizzleKitBin,
  spawnCapturingStderr,
};

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
import { parseArgs } from "node:util";
import { getTableName, is } from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";

import type {
  CommandContext,
  CommandDefinition,
  MigrationDatabase,
  PlumixConfig,
  RuntimeMigrations,
} from "@plumix/core";
import { spawnCapturingStderr } from "@plumix/core/cli";

import type { MigrationOwner } from "../migrate/owners.js";
import { PlumixCliError } from "../errors.js";
import {
  adoptLegacyDatabase,
  applyOwners,
  reportStatus,
} from "../migrate/apply.js";
import {
  nearestPackageRoot,
  resolveOwners,
  SITE_SCHEMA_OUT,
  sitePlugins,
  siteRootOf,
} from "../migrate/owners.js";
import { report } from "../report.js";

export const migrateCommand: CommandDefinition = {
  describe: "Apply each table owner's migrations, or generate the site's",
  async run(ctx) {
    const target = migrationTarget(ctx);
    // `generate` takes no arguments, so it parses none.
    if (ctx.argv[0] === "generate") {
      await migrateGenerate(target);
      return;
    }
    const { sub, remote, binding } = parseMigrateArgs(ctx.argv);
    if (sub === undefined) {
      await checkSiteDrift(target);
      await withDatabase(
        target,
        { remote, binding },
        adoptAndApply(target, binding),
      );
      return;
    }
    if (sub === "fresh") {
      if (remote) throw PlumixCliError.migrateFreshRemote();
      await checkSiteDrift(target);
      await withDatabase(target, { remote, binding }, applyOwners, () => {
        wipeLocalState(target);
      });
      return;
    }
    if (sub === "status") {
      await withDatabase(target, { remote, binding }, reportStatus);
      return;
    }
    throw PlumixCliError.unknownSubcommand({
      command: "migrate",
      subcommand: sub,
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
  readonly remote: boolean;
  readonly binding: string | undefined;
}

function parseMigrateArgs(argv: readonly string[]): MigrateArgs {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      options: {
        remote: { type: "boolean", default: false },
        binding: { type: "string" },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (cause) {
    throw PlumixCliError.migrateInvalidArguments({ cause });
  }
  const [sub, extra] = parsed.positionals;
  if (extra !== undefined) {
    throw PlumixCliError.migrateInvalidArguments({
      cause: `Unexpected argument '${extra}'`,
    });
  }
  return { sub, remote: parsed.values.remote, binding: parsed.values.binding };
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
 * Owners resolve before anything is deleted or opened, so a missing history
 * fails with the database untouched.
 */
async function withDatabase(
  target: MigrationTarget,
  database: Pick<MigrateArgs, "remote" | "binding">,
  work: MigrationWork,
  beforeOpen?: () => void,
): Promise<void> {
  const migrations = runtimeMigrations(target);
  if (database.remote && !migrations.remote) {
    throw PlumixCliError.migrateRemoteUnsupported({
      runtime: target.config.runtime.name,
    });
  }
  const owners = resolveOwners(target.cwd, target.configPath, target.config);
  beforeOpen?.();
  const db = await migrations.open({
    cwd: target.cwd,
    config: target.config,
    location: database.remote ? "remote" : "local",
    binding: database.binding,
  });
  try {
    await work(db, owners, migrations);
  } finally {
    await db.close();
  }
}

type MigrationWork = (
  db: MigrationDatabase,
  owners: readonly MigrationOwner[],
  migrations: RuntimeMigrations,
) => Promise<void>;

/** Adoption builds its scratch database through the same runtime, in memory. */
function adoptAndApply(
  target: MigrationTarget,
  binding: string | undefined,
): MigrationWork {
  return async (db, owners, migrations) => {
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
          binding,
        }),
    );
    await applyOwners(db, owners);
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

/**
 * The paths the runtime's `plumix.e2e.wipe` names, the local state an e2e run
 * starts from nothing, read off the runtime package that provides the commands
 * module.
 */
function wipeLocalState(target: MigrationTarget): void {
  const runtime = target.config.runtime;
  const wipe = runtime.commandsModule
    ? readRuntimeWipe(target.cwd, runtime.commandsModule)
    : undefined;
  if (wipe === undefined) {
    throw PlumixCliError.migrateFreshNoWipe({ runtime: runtime.name });
  }
  for (const path of wipe) {
    rmSync(resolve(target.cwd, path), { recursive: true, force: true });
  }
}

function readRuntimeWipe(
  cwd: string,
  commandsModule: string,
): readonly string[] | undefined {
  const resolved = createRequire(join(cwd, "noop.js")).resolve(commandsModule);
  const root = nearestPackageRoot(resolved);
  if (root === null) return undefined;
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    plumix?: { e2e?: { wipe?: readonly string[] } };
  };
  return pkg.plumix?.e2e?.wipe;
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
 * then every owner applied to the remote database.
 */
export async function migrateBeforeDeploy(ctx: CommandContext): Promise<void> {
  const target = migrationTarget(ctx);
  await checkSiteDrift(target);
  await withDatabase(
    target,
    { remote: true, binding: undefined },
    adoptAndApply(target, undefined),
  );
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
    { remote: false, binding: undefined },
    adoptAndApply(target, undefined),
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

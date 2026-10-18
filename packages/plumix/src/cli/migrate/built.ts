import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type {
  MigrationOwner,
  PlumixConfig,
  RuntimeMigrations,
} from "@plumix/core";
import { loadOnce } from "@plumix/core/support";

import type { DataMigrationOwner } from "./data.js";
import { adoptLegacyDatabase, applyOwners } from "./apply.js";
import { applyDataMigrations, withCoreDataMigrations } from "./data.js";
import { resolveOwners, TRACKING_TABLE_PREFIX } from "./owners.js";

const MIGRATIONS_DIR = "migrations";

/** Lists the owners in application order, each folder relative to it. */
const MANIFEST = "owners.json";

/**
 * The plugin and site data migrations, which `plumix build` bundles here on
 * its own, so the request bundle never carries them.
 */
const DATA_BUNDLE = "data-migrations.js";

/**
 * Copies every owner's history beside the server bundle, as
 * `migrations/<owner>/`, so the built server applies them without the
 * packages that shipped them.
 */
export function copyOwnerHistories(
  site: { cwd: string; configPath: string; config: PlumixConfig },
  serverDir: string,
): void {
  const out = join(serverDir, MIGRATIONS_DIR);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const shipped = resolveOwners(site.cwd, site.configPath, site.config).map(
    (owner) => {
      const folder = owner.migrationsTable.slice(TRACKING_TABLE_PREFIX.length);
      cpSync(owner.migrationsFolder, join(out, folder), { recursive: true });
      return { ...owner, migrationsFolder: folder };
    },
  );
  writeFileSync(join(out, MANIFEST), JSON.stringify(shipped, null, 2));
}

function builtOwners(serverDir: string): readonly MigrationOwner[] {
  const dir = join(serverDir, MIGRATIONS_DIR);
  const shipped = JSON.parse(
    readFileSync(join(dir, MANIFEST), "utf8"),
  ) as MigrationOwner[];
  return shipped.map((owner) => ({
    ...owner,
    migrationsFolder: join(dir, owner.migrationsFolder),
  }));
}

export interface ApplyBuiltMigrationsOptions {
  /** The directory the server bundle sits in, which the build wrote into. */
  readonly serverDir: string;
  readonly cwd: string;
  readonly config: PlumixConfig;
  readonly migrations: RuntimeMigrations;
}

/** The URL is computed at runtime, so the server bundle never inlines it. */
async function builtDataMigrations(
  serverDir: string,
): Promise<readonly DataMigrationOwner[]> {
  const url = pathToFileURL(join(serverDir, MIGRATIONS_DIR, DATA_BUNDLE)).href;
  const bundle = (await loadOnce(() => import(/* @vite-ignore */ url))()) as {
    default: readonly DataMigrationOwner[];
  };
  return bundle.default;
}

/**
 * What a built server runs before it listens: the histories its build
 * shipped, applied to its database, adopting one built by a legacy history,
 * then every owner's data migrations.
 */
export async function applyBuiltMigrations({
  serverDir,
  cwd,
  config,
  migrations,
}: ApplyBuiltMigrationsOptions): Promise<void> {
  const owners = builtOwners(serverDir);
  const db = await migrations.open({
    cwd,
    config,
    location: "site",
    binding: undefined,
    targetValues: {},
  });
  try {
    await adoptLegacyDatabase(db, owners, [], migrations.legacyTable, () =>
      migrations.open({
        cwd,
        config,
        location: "memory",
        binding: undefined,
        targetValues: {},
      }),
    );
    await applyOwners(db, owners);
    await applyDataMigrations(
      db,
      withCoreDataMigrations(await builtDataMigrations(serverDir)),
    );
  } finally {
    await db.close();
  }
}

import type { SQLiteTable as SQLiteTableType } from "drizzle-orm/sqlite-core";
import { getTableName, is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";

import type { PlumixConfig, SyncScope } from "@plumix/core";
import { CORE_SYNC_SCOPE_TABLES } from "@plumix/core/cli";

import { PlumixCliError } from "../errors.js";

const CONTENT = "content";
const USERS = "users";
const MEDIA = "media";
const PLUGIN_PREFIX = "plugin:";

const CONTENT_TABLES = new Set(
  CORE_SYNC_SCOPE_TABLES.content.map((entry) => entry.table),
);

interface PluginScope {
  readonly name: string;
  readonly tables: readonly SQLiteTableType[];
}

function referencedTables(table: SQLiteTableType): string[] {
  return getTableConfig(table).foreignKeys.map((key) =>
    getTableName(key.reference().foreignTable),
  );
}

/** Each table after the plugin's own tables it references. */
function parentsFirst(
  tables: readonly SQLiteTableType[],
): readonly SQLiteTableType[] {
  const byName = new Map(tables.map((table) => [getTableName(table), table]));
  const ordered: SQLiteTableType[] = [];
  const placed = new Set<string>();
  function place(table: SQLiteTableType, visiting: Set<string>): void {
    const name = getTableName(table);
    if (placed.has(name) || visiting.has(name)) return;
    visiting.add(name);
    for (const parent of referencedTables(table)) {
      const own = byName.get(parent);
      if (own !== undefined) place(own, visiting);
    }
    placed.add(name);
    ordered.push(table);
  }
  for (const table of tables) place(table, new Set());
  return ordered;
}

function pluginScopes(config: PlumixConfig): PluginScope[] {
  return config.plugins.flatMap((plugin) => {
    const tables = Object.values(plugin.schema ?? {}).filter(
      (value): value is SQLiteTableType => is(value, SQLiteTable),
    );
    if (tables.length === 0) return [];
    return [
      { name: `${PLUGIN_PREFIX}${plugin.id}`, tables: parentsFirst(tables) },
    ];
  });
}

function referencesContent(scope: PluginScope): boolean {
  return scope.tables.some((table) =>
    referencedTables(table).some((parent) => CONTENT_TABLES.has(parent)),
  );
}

function coreScope(name: keyof typeof CORE_SYNC_SCOPE_TABLES): SyncScope {
  return { name, tables: CORE_SYNC_SCOPE_TABLES[name] };
}

/**
 * The scopes `--scope` names, in load order, with content when none is named.
 * Fails before anything opens on an unknown scope or one that cannot travel
 * without content.
 */
export function resolveScopes(
  names: readonly string[],
  config: PlumixConfig,
): SyncScope[] {
  const requested = new Set(names.length === 0 ? [CONTENT] : names);
  const plugins = pluginScopes(config);
  const available = [
    CONTENT,
    MEDIA,
    USERS,
    ...plugins.map((plugin) => plugin.name),
  ];
  for (const name of requested) {
    if (!available.includes(name)) {
      throw PlumixCliError.syncUnknownScope({ scope: name, available });
    }
  }
  const withContent = requested.has(CONTENT);
  if (requested.has(USERS) && !withContent) {
    throw PlumixCliError.syncScopeRequires({
      scope: USERS,
      requires: CONTENT,
      reason: "entries refuse the deletion of their authors",
    });
  }
  for (const plugin of plugins) {
    if (
      requested.has(plugin.name) &&
      !withContent &&
      referencesContent(plugin)
    ) {
      throw PlumixCliError.syncScopeRequires({
        scope: plugin.name,
        requires: CONTENT,
        reason: "its tables reference content's",
      });
    }
  }
  const scopes: SyncScope[] = [];
  if (requested.has(USERS)) scopes.push(coreScope(USERS));
  if (withContent) scopes.push(coreScope(CONTENT));
  if (requested.has(MEDIA)) scopes.push(coreScope(MEDIA));
  for (const plugin of plugins) {
    if (!requested.has(plugin.name)) continue;
    scopes.push({
      name: plugin.name,
      tables: plugin.tables.map((table) => ({ table: getTableName(table) })),
    });
  }
  return scopes;
}

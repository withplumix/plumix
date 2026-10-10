import seedSql from "./seed.sql?raw";

interface Journal {
  readonly entries: readonly { readonly tag: string }[];
}

/**
 * Each table owner's shipped history, in the order `plumix migrate` applies
 * them: core, then each plugin package that owns tables, in config order. A
 * plugin with tables joins the list and both globs below. `import.meta.glob`
 * is Vite-only, so this module is imported lazily by the demo runtime — jiti
 * (config codegen) never evaluates it.
 */
const OWNERS = [
  "./node_modules/@plumix/core/migrations",
  "./node_modules/@plumix/plugin-comments/migrations",
] as const;

const journals = import.meta.glob<Journal>(
  [
    "./node_modules/@plumix/core/migrations/meta/_journal.json",
    "./node_modules/@plumix/plugin-comments/migrations/meta/_journal.json",
  ],
  { import: "default", eager: true },
);

const migrations = import.meta.glob<string>(
  [
    "./node_modules/@plumix/core/migrations/*.sql",
    "./node_modules/@plumix/plugin-comments/migrations/*.sql",
  ],
  { query: "?raw", import: "default", eager: true },
);

function read<T>(files: Record<string, T>, path: string): T {
  const file = files[path];
  if (file === undefined) throw new Error(`demo SQL: ${path} is missing`);
  return file;
}

/**
 * Each owner's migrations in journal order, then the seed: the SQL a fresh demo
 * DO runs.
 */
export function demoSql(): string {
  const schemaSql = OWNERS.flatMap((folder) =>
    read(journals, `${folder}/meta/_journal.json`).entries.map((entry) =>
      read(migrations, `${folder}/${entry.tag}.sql`),
    ),
  ).join("\n");
  return `${schemaSql}\n${seedSql}`;
}

import seedSql from "./seed.sql?raw";

interface Journal {
  readonly entries: readonly { readonly tag: string }[];
}

/**
 * Ordered as `plumix migrate` applies them; a table-owning plugin joins both
 * globs too. `import.meta.glob` is Vite-only, so jiti must never evaluate
 * this module.
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

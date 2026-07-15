import seedSql from "./seed.sql?raw";

// Committed migrations, applied in filename order to a fresh session DO, then
// the seed. `import.meta.glob` is Vite-only, so this module is imported lazily
// by the demo runtime — jiti (config codegen) never evaluates it.
const migrations = import.meta.glob<string>("./drizzle/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** Schema migrations + seed content: the SQL a fresh demo DO runs. */
export function demoSql(): string {
  const schemaSql = Object.keys(migrations)
    .sort()
    .map((key) => migrations[key])
    .join("\n");
  return `${schemaSql}\n${seedSql}`;
}

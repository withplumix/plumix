// Fail when a package's declared tables are ahead of the migration history it
// ships (ADR 0027). Runs `db:generate` in every workspace package that has one
// — drizzle-kit writes nothing when the schema matches the last snapshot —
// then names each package whose `migrations/` git now sees as changed.
//
// drizzle-kit loads the schema module, and a plugin's imports `plumix/schema`,
// which resolves to `dist/`: build the framework first.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const workspaces = JSON.parse(
  execFileSync("pnpm", ["ls", "-r", "--depth", "-1", "--json"], {
    encoding: "utf8",
  }),
);

const owners = workspaces.filter(({ path }) => {
  const manifest = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
  return manifest.scripts?.["db:generate"] !== undefined;
});

const behind = [];
for (const { name, path } of owners) {
  console.log(`${name}: drizzle-kit generate`);
  execFileSync("pnpm", ["run", "--silent", "db:generate"], {
    cwd: path,
    stdio: "inherit",
  });
  const migrations = relative(root, join(path, "migrations"));
  const changed = execFileSync(
    "git",
    ["status", "--porcelain", "--", migrations],
    { encoding: "utf8" },
  );
  if (changed.trim() !== "") behind.push({ name, changed });
}

if (behind.length > 0) {
  console.error(
    "\nThese packages' tables are ahead of their migration history:\n",
  );
  for (const { name, changed } of behind) {
    console.error(`  ${name}\n${changed.replace(/^/gm, "    ")}`);
  }
  console.error(
    "Run `pnpm --filter <package> db:generate` and commit its `migrations/`.",
  );
  process.exit(1);
}

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "../../db/schema/index.js";

type PlaygroundDb = ReturnType<typeof drizzle<typeof schema>>;

const STATE_SUBPATH = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";

export interface OpenPlaygroundDbOptions {
  readonly cwd?: string;
  readonly binding?: string;
}

/**
 * Open the on-disk miniflare D1 sqlite the playground worker is bound
 * against and return a drizzle `Db` handle compatible with the existing
 * test factories.
 *
 * Single-D1 playgrounds (the 0.1.0 case) work cleanly with a
 * scan-and-pick rule. Multi-D1 lookup is forward-compat via the
 * `binding` parameter which is currently accepted but unused — the
 * underlying miniflare filename derivation isn't documented as stable,
 * so binding-based resolution is deferred to a future helper-side
 * upgrade with no API break for callers.
 *
 * Coordinates with a running `plumix dev` worker over the same sqlite
 * file via SQLite WAL mode: multi-reader, single-writer with
 * non-blocking reads. Test-side writes (e.g. seeding an admin user)
 * during quiet windows are safe; under contention libsql surfaces
 * `SQLITE_BUSY` rather than corrupting state.
 *
 * @experimental Part of the worker-driven plugin e2e helpers landing in
 *   #251. The discovery rule may move from "scan-and-pick" to
 *   binding-aware lookup once miniflare exposes a stable mapping.
 */
export async function openPlaygroundDb(
  options: OpenPlaygroundDbOptions = {},
): Promise<PlaygroundDb> {
  const cwd = options.cwd ?? process.cwd();
  const stateDir = join(cwd, STATE_SUBPATH);

  let files: string[];
  try {
    files = await readdir(stateDir);
  } catch {
    throw new Error(
      `openPlaygroundDb: no D1 state at ${stateDir} — run plumix dev first to create it.`,
    );
  }

  const dbFiles = files.filter(
    (f) => f.endsWith(".sqlite") && f !== "metadata.sqlite",
  );
  if (dbFiles[0] === undefined) {
    throw new Error(
      `openPlaygroundDb: no user D1 sqlite found in ${stateDir} — did the wrangler d1 migrations apply step run? (only metadata.sqlite is present)`,
    );
  }
  if (dbFiles.length > 1) {
    throw new Error(
      `openPlaygroundDb: found multiple D1 sqlite files (${dbFiles.join(", ")}) — binding-based lookup is not yet supported (single-D1 playgrounds only).`,
    );
  }

  const client = createClient({ url: `file:${join(stateDir, dbFiles[0])}` });
  return drizzle(client, { schema, casing: "snake_case" });
}

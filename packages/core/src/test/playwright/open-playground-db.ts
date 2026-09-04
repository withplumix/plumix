import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "../../db/schema/index.js";
import { resolvePlaygroundDbPath } from "./runtime-e2e.js";

type PlaygroundDb = ReturnType<typeof drizzle<typeof schema>>;

export interface OpenPlaygroundDbOptions {
  readonly cwd?: string;
}

/**
 * Open the on-disk SQLite the playground server is bound against and return
 * a drizzle `Db` handle compatible with the existing test factories.
 *
 * Where the file lives is the runtime's to say: it is resolved through the
 * `plumix.e2e` block of the runtime package the playground depends on, so
 * the helper knows nothing about any one runtime's state layout.
 *
 * Coordinates with a running `plumix dev` server over the same sqlite
 * file via SQLite WAL mode: multi-reader, single-writer with
 * non-blocking reads. Test-side writes (e.g. seeding an admin user)
 * during quiet windows are safe; under contention SQLite serializes
 * them behind a 5s `busy_timeout` rather than corrupting state, and
 * surfaces `SQLITE_BUSY` only if the lock is still held past that.
 *
 * @experimental Part of the worker-driven plugin e2e helpers landing in
 *   #251.
 */
export async function openPlaygroundDb(
  options: OpenPlaygroundDbOptions = {},
): Promise<PlaygroundDb> {
  const path = resolvePlaygroundDbPath(options.cwd ?? process.cwd());
  const client = createClient({ url: `file:${path}` });
  // libsql opens with no busy handler at all, so a write that overlaps one
  // from the running worker — or from a sibling Playwright worker holding
  // this same file — fails on the first attempt instead of waiting. That
  // surfaces as a failure in whichever hook took the lock second, masking
  // whatever the test was actually checking.
  await client.execute("PRAGMA busy_timeout = 5000");
  return drizzle(client, { schema, casing: "snake_case" });
}

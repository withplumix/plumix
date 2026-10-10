import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "../../db/schema/index.js";
import { resolvePlaygroundDbPath } from "./runtime-e2e.js";

type PlaygroundDb = ReturnType<typeof drizzle<typeof schema>>;

export interface OpenPlaygroundDbOptions {
  readonly cwd?: string;
}

/**
 * Open the playground server's on-disk SQLite, located through the runtime's
 * `plumix.e2e` block. WAL mode plus a 5s `busy_timeout` lets test writes
 * coexist with the running server.
 *
 * @experimental
 */
export async function openPlaygroundDb(
  options: OpenPlaygroundDbOptions = {},
): Promise<PlaygroundDb> {
  const path = resolvePlaygroundDbPath(options.cwd ?? process.cwd());
  const client = createClient({ url: `file:${path}` });
  // libsql opens with no busy handler, so a write overlapping the worker's or a
  // sibling Playwright worker's fails at once instead of waiting.
  await client.execute("PRAGMA busy_timeout = 5000");
  return drizzle(client, { schema, casing: "snake_case" });
}

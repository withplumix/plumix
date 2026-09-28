import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeDatabaseContract } from "plumix/test/conformance";
import { afterEach, beforeEach } from "vitest";

import { bunSqlite } from "./bun-sqlite.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "plumix-bun-sqlite-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describeDatabaseContract({
  connect: () => ({ adapter: bunSqlite({ path: join(dir, "site.sqlite") }) }),
});

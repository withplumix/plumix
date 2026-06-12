import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { actingAs, openPlaygroundDb } from "plumix/test/playwright";

// Seeds an admin user into the migrated D1 and writes the storageState
// playwright's `use.storageState` reads, so the moderation queue specs
// run authenticated.
export default async function globalSetup(): Promise<void> {
  const playgroundCwd = resolve(process.cwd(), "playground");
  const db = await openPlaygroundDb({ cwd: playgroundCwd });
  const { storageState } = await actingAs(db, "admin");
  await writeFile(
    resolve(process.cwd(), "storageState.json"),
    JSON.stringify(storageState, null, 2),
    "utf8",
  );
}

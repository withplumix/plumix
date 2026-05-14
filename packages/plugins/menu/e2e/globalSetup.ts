import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { actingAs, openPlaygroundDb } from "plumix/test/playwright";

// Runs once after the baked webServer is ready, before the spec
// suite. Seeds an admin user into the migrated D1, mints a session,
// and writes the storageState.json that playwright's
// `use.storageState` reads per-context.
//
// Anchors on `process.cwd()` because that's what playwright's
// node:fs-based storageState reader uses too — keeps the file the
// runner writes and the file the runner reads in lockstep regardless
// of where the runner was invoked from.
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

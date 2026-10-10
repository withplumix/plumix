import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { actingAs, openPlaygroundDb } from "plumix/test/playwright";

/**
 * Anchors on `process.cwd()` because playwright's storageState reader
 * resolves from it too, so the written and read files always match.
 */
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

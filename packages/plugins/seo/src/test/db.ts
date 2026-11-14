import { fileURLToPath } from "node:url";
import type { DispatcherHarness } from "plumix/test";
import { applyTestSchema } from "plumix/test";

/** The history this package ships, at its root. */
const migrations = fileURLToPath(new URL("../../migrations", import.meta.url));

/**
 * Applies the plugin's tables onto a dispatcher harness's core database, which
 * builds core's alone.
 */
export async function applySeoSchema(
  db: DispatcherHarness["db"],
): Promise<void> {
  await applyTestSchema(db, migrations);
}

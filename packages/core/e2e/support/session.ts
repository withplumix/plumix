import { resolve } from "node:path";
import type { Page } from "@playwright/test";

import type { Factories } from "@plumix/core/test";
import { factoriesFor } from "@plumix/core/test";
import { actingAs, openPlaygroundDb } from "@plumix/core/test/playwright";

import type { User } from "../../src/db/schema/users.js";

export interface EditorSession {
  readonly admin: User;
  readonly factories: Factories;
}

/**
 * Signs `page` in as a fresh admin of its own, so a spec's drafts and
 * autosaves never meet another worker's.
 */
export async function signInAsAdmin(page: Page): Promise<EditorSession> {
  const db = await openPlaygroundDb({
    cwd: resolve(process.cwd(), "playground"),
  });
  const { user, storageState } = await actingAs(db, "admin");
  await page.context().addCookies([...storageState.cookies]);
  return { admin: user, factories: factoriesFor(db) };
}

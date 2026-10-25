import type { PluginSetupContext } from "plumix/plugin";
import type { ConnectedObjectStorage } from "plumix/runtime";
import { sync } from "plumix/plugin";

import { CARD_STORAGE_PREFIX } from "./card-route.js";

async function deleteStoredCards(
  storage: ConnectedObjectStorage,
): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await storage.list(
      CARD_STORAGE_PREFIX,
      cursor === undefined ? {} : { cursor },
    );
    for (const item of page.items) await storage.delete(item.key);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor !== undefined);
}

/**
 * A sync replaced the content under ids the stored cards were rendered from,
 * so every card is dropped and rendered again on its next request.
 */
export function registerSyncCardReset(ctx: PluginSetupContext): void {
  ctx.events.on(sync.after, async (event, appCtx) => {
    if (!event.scopes.includes("content") || appCtx.storage === undefined) {
      return;
    }
    await deleteStoredCards(appCtx.storage);
  });
}

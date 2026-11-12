import { SYNC_PREFIX, SYNC_SETTLE_PATH } from "../../src/runtime/dispatcher.js";
import { SYNC_TRANSFER_ACTIONS } from "../../src/runtime/sync-transfer.js";

export interface SyncRoute {
  readonly method: "GET" | "POST";
  readonly path: string;
}

/** Every route `plumix sync` calls, as the dispatcher registers them. */
export const SYNC_ROUTES: readonly SyncRoute[] = [
  ...Object.entries(SYNC_TRANSFER_ACTIONS).map(([action, method]) => ({
    method,
    path: `${SYNC_PREFIX}${action}`,
  })),
  { method: "POST", path: SYNC_SETTLE_PATH },
];

import { useSyncExternalStore } from "react";

// Nothing external to subscribe to: the store never changes, and the two
// snapshots differ only in *where* they are read.
const NEVER_CHANGES = () => () => undefined;
const onClient = () => true;
const onServer = () => false;

/**
 * False through the server render and the first client render. Avoids an
 * effect-driven state update, which would re-render every island on the page.
 */
export function useIsLive(): boolean {
  return useSyncExternalStore(NEVER_CHANGES, onClient, onServer);
}

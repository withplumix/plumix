import { useSyncExternalStore } from "react";

// Nothing external to subscribe to: the store never changes, and the two
// snapshots differ only in *where* they are read.
const NEVER_CHANGES = () => () => undefined;
const onClient = () => true;
const onServer = () => false;

/**
 * False through the server render and the first client render, true once the
 * component is live in a browser.
 *
 * It is how a component tells "rendered on the server" from "running in a
 * browser" without a state update in an effect, which would cascade a second
 * render on every island on the page. Progressive enhancement reads from it:
 * what marks a form enhanced is JavaScript running, not markup that shipped
 * with it, so a visitor whose island never hydrates keeps the plain form and
 * the browser's own checks.
 */
export function useIsLive(): boolean {
  return useSyncExternalStore(NEVER_CHANGES, onClient, onServer);
}

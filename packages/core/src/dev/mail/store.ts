import type {
  CaughtMail,
  CaughtMailStore,
  DebugHistoryStoreOptions,
} from "../../context/dev-runtime.js";
import { createBoundedRing, sanitize } from "../request-history/store.js";

/** Bounded by `config.dev.history`, the same caps as the request history. */
export function createCaughtMailStore(
  options: DebugHistoryStoreOptions = {},
): CaughtMailStore {
  const ring = createBoundedRing<CaughtMail>(options);
  return {
    save(mail) {
      ring.push(mail, (item, maxString) => {
        const sanitized = sanitize(item, maxString);
        // Safety: `sanitize` rewrites leaves, never structure, so every field
        // a caught mail declares survives with a value of its declared shape.
        const stored = sanitized as unknown as CaughtMail;
        return { stored, measured: sanitized };
      });
    },
    get() {
      return [...ring.items()].reverse();
    },
    clear() {
      ring.clear();
    },
  };
}

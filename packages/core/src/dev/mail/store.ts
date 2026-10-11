import type { CaughtMail, CaughtMailStore } from "../../context/dev-runtime.js";
import {
  DEFAULT_MAX_STRING_LENGTH,
  sanitize,
} from "../request-history/store.js";

/** Enough to scroll back through a session's sign-ins and notifications. */
const MAX_CAUGHT_MAILS = 50;

export function createCaughtMailStore(): CaughtMailStore {
  // Oldest-first; `get` reverses.
  let mails: CaughtMail[] = [];
  return {
    save(mail) {
      const sanitized = sanitize(mail, DEFAULT_MAX_STRING_LENGTH);
      // Safety: `sanitize` rewrites leaves, never structure, so every field a
      // caught mail declares survives with a value of its declared shape.
      mails.push(sanitized as unknown as CaughtMail);
      if (mails.length > MAX_CAUGHT_MAILS) mails.shift();
    },
    get() {
      return [...mails].reverse();
    },
    clear() {
      mails = [];
    },
  };
}

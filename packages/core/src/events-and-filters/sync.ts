import type { SyncAfterEvent } from "../context/runtime-adapter.js";
import { defineEvent } from "./define.js";

/** Core's events about `plumix sync`. */
export const sync = {
  /**
   * Fires once on the target after a sync replaced its data, on a pull and a
   * push alike. A throw is reported as a failed settle step.
   */
  after: defineEvent<SyncAfterEvent>("sync:after"),
};

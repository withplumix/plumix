// tsc drops augmentations from modules reached only through value or type
// imports; a side-effect import keeps each public hook's augmentation in the
// published declarations.
import "../rpc/hooks.js"; // settings:* filters and actions

import { entryRpc, termRpc } from "../rpc/filters.js";
import { entry as entryEvents } from "./entry.js";
import { term as termEvents } from "./term.js";

/**
 * Core's events and filters about entries. `entry.for(type)` scopes the events
 * and `beforeSave` to one type; the `rpc` filters are unscoped.
 */
export const entry = { ...entryEvents, rpc: entryRpc };

/** Core's events and filters about terms; see {@link entry}. */
export const term = { ...termEvents, rpc: termRpc };

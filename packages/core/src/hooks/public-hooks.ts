import type { SettingsRpc } from "../rpc/filters.js";
import type { SettingsGroupEvents } from "./settings.js";
import {
  entryRpc,
  settingsRpc,
  settingsRpcFor,
  termRpc,
} from "../rpc/filters.js";
import { entry as entryEvents } from "./entry.js";
import { settings as settingsEvents } from "./settings.js";
import { term as termEvents } from "./term.js";

/**
 * Core's events and filters about entries. `entry.for(type)` scopes the events
 * and `beforeSave` to one type; the `rpc` filters are unscoped.
 */
export const entry = { ...entryEvents, rpc: entryRpc };

/** Core's events and filters about terms; see {@link entry}. */
export const term = { ...termEvents, rpc: termRpc };

/** What `settings.for(group)` returns. */
export type SettingsGroupHandle = SettingsGroupEvents & {
  readonly rpc: SettingsRpc;
};

/**
 * Core's events and filters about settings groups. `settings.for(group)`
 * scopes all of them, the `rpc` filters too, to one group.
 */
export const settings = {
  groupChanged: settingsEvents.groupChanged,
  rpc: settingsRpc,
  for: (group: string): SettingsGroupHandle => ({
    ...settingsEvents.for(group),
    rpc: settingsRpcFor(group),
  }),
};

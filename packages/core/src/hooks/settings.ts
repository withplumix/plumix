import type { SettingsBag } from "../db/schema/settings.js";
import { defineEvent } from "./define.js";
import { scopeDeclarations } from "./scope.js";

/** A settings group's events, as one group sees them. */
const declarations = {
  /**
   * A write changed the group: the keys it set and the keys it removed. Not
   * emitted for a private (`_internal`) group, whose values are server-side
   * secrets.
   */
  groupChanged: defineEvent<{
    readonly group: string;
    readonly set: SettingsBag;
    readonly removed: readonly string[];
  }>("settings:groupChanged"),
};

/** The events `settings.for(group)` scopes to one group. */
export type SettingsGroupEvents = typeof declarations;

/** Core's events about settings groups. */
export const settings = {
  ...declarations,
  /**
   * The same events, run only for `group`. A group no plugin registers fails
   * boot.
   */
  for: (group: string): SettingsGroupEvents =>
    scopeDeclarations(declarations, group),
};

/** Every declaration `settings` holds, for the boot checks. */
export const settingsDeclarations = Object.values(declarations);

import type { AppContext } from "../context/app-context.js";
import type { SettingsBag, SettingsGroupCopy } from "../db/schema/settings.js";
import type {
  SettingsGetInput,
  SettingsUpsertInput,
} from "./procedures/settings/schemas.js";

declare module "../hooks/types.js" {
  interface FilterRegistry {
    "rpc:settings.get:input": (input: SettingsGetInput) => SettingsGetInput;
    /**
     * Plugins can decorate, redact or replace the bag; the second argument
     * carries the group so one filter can branch on scope.
     */
    "rpc:settings.get:output": (
      output: SettingsGroupCopy,
      context: { readonly group: string },
      ctx: AppContext,
    ) => SettingsGroupCopy | Promise<SettingsGroupCopy>;

    "rpc:settings.upsert:input": (
      input: SettingsUpsertInput,
    ) => SettingsUpsertInput;
    /**
     * Output filter for `settings.upsert`. Runs on the authoritative
     * bag after the write. Same context shape as `settings.get:output`
     * so plugins can share a single decorator across read and write
     * paths.
     */
    "rpc:settings.upsert:output": (
      output: SettingsGroupCopy,
      context: { readonly group: string },
      ctx: AppContext,
    ) => SettingsGroupCopy | Promise<SettingsGroupCopy>;
  }

  // Every action below hands its handler the context it fired from, last, so a
  // handler accepts what it depends on rather than reaching for the ambient
  // one.
  interface ActionRegistry {
    /**
     * Not fired for a private (`_internal`) group, whose values are
     * server-side secrets.
     */
    "settings:group_changed": (
      changes: {
        readonly group: string;
        readonly set: SettingsBag;
        readonly removed: readonly string[];
      },
      ctx: AppContext,
    ) => void | Promise<void>;
  }
}

export {};

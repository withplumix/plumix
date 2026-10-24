import type { JsonValue } from "../json.js";
import type {
  AppContext,
  SettingsGroupCopy,
  SettingsNamespace,
  SettingsPatch,
  SettingsWriteGuard,
} from "./app-context.js";

/** How `ctx.settings` asked for the write: from a copy, or only where absent. */
export interface SettingsWriteMode {
  readonly guard?: SettingsWriteGuard;
  readonly ifAbsent?: boolean;
}

/** The writes `ctx.settings` runs, each given the context it is bound to. */
export interface SettingsWrites {
  write(
    ctx: AppContext,
    group: string,
    values: SettingsPatch,
    mode: SettingsWriteMode,
  ): Promise<SettingsGroupCopy>;
  removeValue(
    ctx: AppContext,
    group: string,
    value: JsonValue,
  ): Promise<SettingsGroupCopy>;
}

/**
 * Kept beside the namespace rather than on it, so a context derived from
 * another rebinds the same writes without the capability layer's import.
 */
const bound = new WeakMap<SettingsNamespace, SettingsWrites>();

/** `ctx.settings`, writing as the context `ctx` answers. */
export function bindSettings(
  writes: SettingsWrites,
  ctx: () => AppContext,
): SettingsNamespace {
  const namespace: SettingsNamespace = {
    write: (group, values, guard) =>
      writes.write(ctx(), group, values, { guard }),
    writeIfAbsent: (group, values) =>
      writes.write(ctx(), group, values, { ifAbsent: true }),
    removeValue: (group, value) => writes.removeValue(ctx(), group, value),
  };
  bound.set(namespace, writes);
  return namespace;
}

/**
 * Every context derived by spreading another rebinds, or the write's
 * subscribers would hear the signal, request or principal it was derived from.
 */
export function rebindSettings<TSchema extends Record<string, unknown>>(
  settings: SettingsNamespace,
  ctx: () => AppContext<TSchema>,
): SettingsNamespace {
  const writes = bound.get(settings);
  return writes === undefined
    ? settings
    : bindSettings(writes, () => coreSchemaView(ctx()));
}

function coreSchemaView<TSchema extends Record<string, unknown>>(
  ctx: AppContext<TSchema>,
): AppContext {
  // Safety: the settings write reaches only core's tables, which every
  // site's schema carries beside its own.
  return ctx as unknown as AppContext;
}

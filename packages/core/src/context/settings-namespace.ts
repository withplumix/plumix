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

type SettingsWrite = (
  ctx: AppContext,
  group: string,
  values: SettingsPatch,
  mode: SettingsWriteMode,
) => Promise<SettingsGroupCopy>;

/**
 * Kept beside the namespace rather than on it, so a context derived from
 * another rebinds the same write without the capability layer's import.
 */
const writes = new WeakMap<SettingsNamespace, SettingsWrite>();

/** `ctx.settings`, writing as the context `ctx` answers. */
export function bindSettings(
  write: SettingsWrite,
  ctx: () => AppContext,
): SettingsNamespace {
  const namespace: SettingsNamespace = {
    write: (group, values, guard) => write(ctx(), group, values, { guard }),
    writeIfAbsent: (group, values) =>
      write(ctx(), group, values, { ifAbsent: true }),
  };
  writes.set(namespace, write);
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
  const write = writes.get(settings);
  return write === undefined
    ? settings
    : bindSettings(write, () => coreSchemaView(ctx()));
}

function coreSchemaView<TSchema extends Record<string, unknown>>(
  ctx: AppContext<TSchema>,
): AppContext {
  // Safety: the settings write reaches only core's tables, which every
  // site's schema carries beside its own.
  return ctx as unknown as AppContext;
}

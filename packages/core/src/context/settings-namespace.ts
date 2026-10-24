import type {
  AppContext,
  SettingsGroupCopy,
  SettingsNamespace,
  SettingsPatch,
  SettingsWriteGuard,
} from "./app-context.js";

type SettingsWrite = (
  ctx: AppContext,
  group: string,
  values: SettingsPatch,
  guard?: SettingsWriteGuard,
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
    write: (group, values, guard) => write(ctx(), group, values, guard),
  };
  writes.set(namespace, write);
  return namespace;
}

/**
 * A derived context that changes who is signed in rebinds, or the write's
 * subscribers would hear the context it was derived from.
 */
export function rebindSettings(
  settings: SettingsNamespace,
  ctx: () => AppContext,
): SettingsNamespace {
  const write = writes.get(settings);
  return write === undefined ? settings : bindSettings(write, ctx);
}

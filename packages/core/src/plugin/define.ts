export interface PluginContext {
  readonly id: string;
}

export type PluginSetup<TConfig> = (
  ctx: PluginContext,
  config: TConfig,
) => void | Promise<void>;

export interface PluginDescriptor<TConfig = undefined> {
  readonly id: string;
  readonly version?: string;
  readonly setup: PluginSetup<TConfig>;
}

export function definePlugin<TConfig = undefined>(
  id: string,
  setup: PluginSetup<TConfig>,
  options?: { version?: string },
): PluginDescriptor<TConfig> {
  return {
    id,
    version: options?.version,
    setup,
  };
}

import type { PluginSetupContext } from "./context.js";

export type PluginSetup<TConfig> = (
  ctx: PluginSetupContext,
  config: TConfig,
) => void | Promise<void>;

export interface PluginDescriptor<TConfig = undefined> {
  readonly id: string;
  readonly version?: string;
  readonly setup: PluginSetup<TConfig>;
  readonly schema?: Record<string, unknown>;
  readonly schemaModule?: string;
}

export interface DefinePluginOptions {
  readonly version?: string;
  readonly schema?: Record<string, unknown>;
  readonly schemaModule?: string;
}

export function definePlugin<TConfig = undefined>(
  id: string,
  setup: PluginSetup<TConfig>,
  options?: DefinePluginOptions,
): PluginDescriptor<TConfig> {
  return {
    id,
    version: options?.version,
    setup,
    schema: options?.schema,
    schemaModule: options?.schemaModule,
  };
}

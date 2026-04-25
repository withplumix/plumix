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
  /** Pre-built ESM staged at `/_plumix/admin/plugins/<id>.js`. */
  readonly adminChunk?: string;
  /** Pre-built stylesheet staged at `/_plumix/admin/plugins/<id>.css`. */
  readonly adminCss?: string;
  /** Semver range of `@plumix/admin` this plugin was built against. */
  readonly adminPeerVersion?: string;
}

export interface DefinePluginOptions {
  readonly version?: string;
  readonly schema?: Record<string, unknown>;
  readonly schemaModule?: string;
  readonly adminChunk?: string;
  readonly adminCss?: string;
  readonly adminPeerVersion?: string;
}

// URL- and SQL-identifier-safe — plugin ids become path segments,
// RPC namespace keys, and nav-group ids without quoting.
export const PLUGIN_ID_RE = /^[a-z][a-z0-9_-]*$/;
export const MAX_PLUGIN_ID_LENGTH = 64;

export function assertValidPluginId(id: string): void {
  if (id.length === 0 || id.length > MAX_PLUGIN_ID_LENGTH) {
    throw new Error(
      `Plugin id "${id}" must be between 1 and ${MAX_PLUGIN_ID_LENGTH} ` +
        `characters.`,
    );
  }
  if (!PLUGIN_ID_RE.test(id)) {
    throw new Error(
      `Plugin id "${id}" must match ${PLUGIN_ID_RE} (lowercase ASCII ` +
        `starting with a letter; alphanumerics, hyphens, and underscores).`,
    );
  }
}

export function definePlugin<TConfig = undefined>(
  id: string,
  setup: PluginSetup<TConfig>,
  options?: DefinePluginOptions,
): PluginDescriptor<TConfig> {
  assertValidPluginId(id);
  return {
    id,
    version: options?.version,
    setup,
    schema: options?.schema,
    schemaModule: options?.schemaModule,
    adminChunk: options?.adminChunk,
    adminCss: options?.adminCss,
    adminPeerVersion: options?.adminPeerVersion,
  };
}

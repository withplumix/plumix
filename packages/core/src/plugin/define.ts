import type { PluginProvidesContext, PluginSetupContext } from "./context.js";

export type PluginSetup<TConfig> = (
  ctx: PluginSetupContext,
  config: TConfig,
) => void | Promise<void>;

export type PluginProvides = (
  ctx: PluginProvidesContext,
) => void | Promise<void>;

export interface PluginDescriptor<TConfig = undefined> {
  readonly id: string;
  readonly version?: string;
  readonly provides?: PluginProvides;
  readonly setup: PluginSetup<TConfig>;
  readonly schema?: Record<string, unknown>;
  readonly schemaModule?: string;
  /**
   * Path to the plugin's admin entry — a TypeScript/TSX module that
   * imports React from the bare specifier and registers components via
   * `window.plumix.registerPluginPage(...)`. Resolved relative to the
   * consumer site's root. The plumix vite plugin assembles every
   * declared `adminEntry` into a single per-site bundle with `react`,
   * `react-dom`, `@tanstack/*` aliased to host-shared shims.
   */
  readonly adminEntry?: string;
  /** Pre-built admin chunk path. Legacy alternative to `adminEntry` —
   *  prefer source for the alias seam. */
  readonly adminChunk?: string;
  readonly adminCss?: string;
  readonly adminPeerVersion?: string;
}

export interface DefinePluginOptions {
  readonly version?: string;
  readonly schema?: Record<string, unknown>;
  readonly schemaModule?: string;
  readonly adminEntry?: string;
  readonly adminChunk?: string;
  readonly adminCss?: string;
  readonly adminPeerVersion?: string;
}

export interface DefinePluginInput<TConfig> extends DefinePluginOptions {
  readonly provides?: PluginProvides;
  readonly setup: PluginSetup<TConfig>;
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
): PluginDescriptor<TConfig>;
export function definePlugin<TConfig = undefined>(
  id: string,
  input: DefinePluginInput<TConfig>,
): PluginDescriptor<TConfig>;
export function definePlugin<TConfig = undefined>(
  id: string,
  setupOrInput: PluginSetup<TConfig> | DefinePluginInput<TConfig>,
  legacyOptions?: DefinePluginOptions,
): PluginDescriptor<TConfig> {
  assertValidPluginId(id);
  if (typeof setupOrInput === "function") {
    return {
      id,
      version: legacyOptions?.version,
      setup: setupOrInput,
      schema: legacyOptions?.schema,
      schemaModule: legacyOptions?.schemaModule,
      adminEntry: legacyOptions?.adminEntry,
      adminChunk: legacyOptions?.adminChunk,
      adminCss: legacyOptions?.adminCss,
      adminPeerVersion: legacyOptions?.adminPeerVersion,
    };
  }
  if (legacyOptions !== undefined) {
    throw new Error(
      `definePlugin("${id}", input) — pass options inside the input ` +
        `object (\`setup\`, \`provides\`, \`schema\`, ...) instead of the ` +
        `legacy third argument.`,
    );
  }
  return {
    id,
    version: setupOrInput.version,
    provides: setupOrInput.provides,
    setup: setupOrInput.setup,
    schema: setupOrInput.schema,
    schemaModule: setupOrInput.schemaModule,
    adminEntry: setupOrInput.adminEntry,
    adminChunk: setupOrInput.adminChunk,
    adminCss: setupOrInput.adminCss,
    adminPeerVersion: setupOrInput.adminPeerVersion,
  };
}

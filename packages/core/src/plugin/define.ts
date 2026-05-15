import type { PluginProvidesContext, PluginSetupContext } from "./context.js";
import { PluginDefinitionError } from "./errors.js";

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
    throw PluginDefinitionError.invalidPluginIdLength({
      pluginId: id,
      pluginIdMaxLength: MAX_PLUGIN_ID_LENGTH,
    });
  }
  if (!PLUGIN_ID_RE.test(id)) {
    throw PluginDefinitionError.invalidPluginIdShape({
      pluginId: id,
      pattern: PLUGIN_ID_RE.source,
    });
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
    warnIfSchemaWithoutSchemaModule(id, legacyOptions);
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
    throw PluginDefinitionError.definePluginLegacyThirdArg({ pluginId: id });
  }
  warnIfSchemaWithoutSchemaModule(id, setupOrInput);
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

// Per-id dedup so a plugin defined twice (re-imports, HMR, repeat
// build entries) only emits the warning once.
const warnedIds = new Set<string>();

function warnIfSchemaWithoutSchemaModule(
  id: string,
  opts:
    | { readonly schema?: unknown; readonly schemaModule?: unknown }
    | undefined,
): void {
  if (!opts?.schema || opts.schemaModule) return;
  if (warnedIds.has(id)) return;
  warnedIds.add(id);
  console.warn(
    `[plumix] plugin "${id}" declares \`schema\` but not ` +
      `\`schemaModule\`. Runtime queries will work, but ` +
      `\`plumix migrate generate\` won't include this plugin's tables ` +
      `in the generated migrations — you'll hit "no such table" the ` +
      `first time a query runs. Add ` +
      `\`schemaModule: "<package>/schema"\` and export the matching ` +
      `subpath.`,
  );
}

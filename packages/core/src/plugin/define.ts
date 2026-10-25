import type { ShortcodeSpec } from "../blocks/index.js";
import type { AnyMailDefinition } from "../mail/contract/registry.js";
import type { SchemaModule } from "../runtime/contract/slots.js";
import type { AuthMethodDefinition } from "./auth-method.js";
import type { PluginProvidesContext } from "./provides-context.js";
import type {
  PluginAfterSetupContext,
  PluginSetupContext,
} from "./setup-context-types.js";
import { PluginDefinitionError } from "./errors.js";

export type PluginSetup<TState = undefined> = (
  ctx: PluginSetupContext,
  state: TState,
) => void | Promise<void>;

export type PluginAfterSetup<TState = undefined> = (
  ctx: PluginAfterSetupContext,
  state: TState,
) => void | Promise<void>;

export type PluginProvides<TState = undefined> = (
  ctx: PluginProvidesContext,
  state: TState,
) => void | Promise<void>;

/**
 * Called once per install, before any plugin's `provides`. A descriptor can
 * be installed more than once, so a factory's closure is not per install.
 */
type PluginStateFactory<TState> = () => TState | Promise<TState>;

export interface PluginI18nSlot {
  /** Source locale every msgid is authored in. Admin reads it from the
   *  manifest to resolve plugin catalog paths, never the lingui config. */
  readonly sourceLocale: string;
  /** Directory of the compiled `<locale>.mjs` catalogs, relative to the
   *  plugin's package root. The build serves the locales whose `.mjs` it
   *  finds here. */
  readonly catalogPath: string;
}

export interface PluginDescriptor<TState = undefined> {
  readonly id: string;
  readonly version?: string;
  /**
   * What this install keeps for its own hooks, passed as their second
   * argument. Never put on a context, so other plugins never see it.
   */
  readonly state?: PluginStateFactory<TState>;
  readonly provides?: PluginProvides<TState>;
  readonly setup: PluginSetup<TState>;
  /**
   * Runs after every plugin's `setup`, in array order, for registrations
   * derived from what other plugins registered.
   */
  readonly afterSetup?: PluginAfterSetup<TState>;
  /**
   * Declared rather than registered so the build can ship them to the editor
   * canvas, where a body expands as it does on the page.
   */
  readonly shortcodes?: readonly ShortcodeSpec[];
  /**
   * Declared rather than registered so they are known at boot: a duplicate name
   * fails it, and overrides are checked against them.
   */
  readonly mails?: readonly AnyMailDefinition[];
  /**
   * Sign-in methods, declared so a duplicate or reserved name fails boot. Each
   * answers at `/_plumix/auth/<name>/`.
   */
  readonly authMethods?: readonly AuthMethodDefinition[];
  readonly schema?: SchemaModule;
  readonly schemaModule?: string;
  /**
   * A module whose default export is this plugin's ordered data migrations,
   * resolved from the site like `schemaModule`. Needs no tables.
   */
  readonly dataMigrations?: string;
  /** Translation catalog declaration — opts the plugin into the i18n
   *  pipeline. Omit to keep all labels rendered as their authored
   *  strings (no translation lookup, no catalog discovery). */
  readonly i18n?: PluginI18nSlot;
  /**
   * Resolved relative to the site root. Import React from the bare specifier:
   * the bundle aliases `react`, `react-dom` and `@tanstack/*` to host-shared
   * shims.
   */
  readonly adminEntry?: string;
  /** Pre-built admin chunk path. Legacy alternative to `adminEntry` —
   *  prefer source for the alias seam. */
  readonly adminChunk?: string;
  readonly adminCss?: string;
  readonly adminPeerVersion?: string;
}

export interface DefinePluginInput<TState> {
  readonly version?: string;
  /** See {@link PluginDescriptor.state}. */
  readonly state?: PluginStateFactory<TState>;
  readonly provides?: PluginProvides<TState>;
  readonly setup: PluginSetup<TState>;
  readonly afterSetup?: PluginAfterSetup<TState>;
  /** See {@link PluginDescriptor.shortcodes}. */
  readonly shortcodes?: readonly ShortcodeSpec[];
  /** See {@link PluginDescriptor.mails}. */
  readonly mails?: readonly AnyMailDefinition[];
  /** See {@link PluginDescriptor.authMethods}. */
  readonly authMethods?: readonly AuthMethodDefinition[];
  readonly schema?: SchemaModule;
  readonly schemaModule?: string;
  /** See {@link PluginDescriptor.dataMigrations}. */
  readonly dataMigrations?: string;
  readonly adminEntry?: string;
  readonly adminChunk?: string;
  readonly adminCss?: string;
  readonly adminPeerVersion?: string;
  readonly i18n?: PluginI18nSlot;
}

/** Takes the package name, not the plugin id: the two can diverge
 *  (`audit_log`'s package is `@plumix/plugin-audit-log`). */
export function pluginAdminEntryPath(packageName: string): string {
  return `node_modules/${packageName}/dist/admin/index.js`;
}

/** The slot first-party plugins share. Its source locale must match
 *  `defineLinguiConfig()`'s.
 *  Guarded by: packages/core/src/plugin/define.test.ts */
export const PLUGIN_I18N_SLOT: PluginI18nSlot = {
  sourceLocale: "en",
  catalogPath: "./locales",
};

/**
 * URL- and SQL-identifier-safe — plugin ids become path segments,
 * RPC namespace keys, and nav-group ids without quoting.
 */
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

export function definePlugin<TState = undefined>(
  id: string,
  input: DefinePluginInput<TState>,
): PluginDescriptor<TState> {
  assertValidPluginId(id);
  warnIfSchemaWithoutSchemaModule(id, input);
  return {
    id,
    version: input.version,
    state: input.state,
    provides: input.provides,
    setup: input.setup,
    afterSetup: input.afterSetup,
    shortcodes: input.shortcodes,
    mails: input.mails,
    authMethods: input.authMethods,
    schema: input.schema,
    schemaModule: input.schemaModule,
    dataMigrations: input.dataMigrations,
    adminEntry: input.adminEntry,
    adminChunk: input.adminChunk,
    adminCss: input.adminCss,
    adminPeerVersion: input.adminPeerVersion,
    i18n: input.i18n,
  };
}

/**
 * Per-id dedup so a plugin defined twice (re-imports, HMR, repeat
 * build entries) only emits the warning once.
 */
const warnedIds = new Set<string>();

function warnIfSchemaWithoutSchemaModule(
  id: string,
  opts: { readonly schema?: unknown; readonly schemaModule?: unknown },
): void {
  if (!opts.schema || opts.schemaModule) return;
  if (warnedIds.has(id)) return;
  warnedIds.add(id);
  console.warn(
    `[plumix] plugin "${id}" declares \`schema\` but not ` +
      `\`schemaModule\`. Runtime queries will work, but ` +
      `\`plumix migrate\` won't find the migration history of this ` +
      `plugin's tables — you'll hit "no such table" the ` +
      `first time a query runs. Add ` +
      `\`schemaModule: "<package>/schema"\` and export the matching ` +
      `subpath.`,
  );
}

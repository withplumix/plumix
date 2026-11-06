import type { AnyPluginDescriptor } from "../config.js";
import type { MutableDevRuntime } from "../context/dev-runtime.js";
import type {
  AnyEventDefinition,
  AnyFilterDefinition,
} from "../hooks/define.js";
import type { HookRegistry } from "../hooks/registry.js";
import type {
  MutablePluginRegistry,
  PluginRegistry,
} from "../plugin/manifest.js";
import type { ContextExtensionEntry } from "../plugin/provides-context.js";
import type { ThemeDescriptor } from "../theme.js";
import { auth } from "../hooks/auth.js";
import { block } from "../hooks/block-render.js";
import { entryDeclarations } from "../hooks/entry.js";
import { render } from "../hooks/render.js";
import { sync } from "../hooks/sync.js";
import { termDeclarations } from "../hooks/term.js";
import { assertValidPluginId } from "../plugin/define.js";
import {
  DuplicateRegistrationError,
  PluginDefinitionError,
} from "../plugin/errors.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { createPluginProvidesContext } from "../plugin/provides-context.js";
import {
  createPluginAfterSetupContext,
  createPluginSetupContext,
} from "../plugin/setup-context.js";
import { rpcFilterDeclarations } from "../rpc/filters.js";
import { user } from "../rpc/procedures/user/subject.js";

export interface PluginInstallResult {
  readonly hooks: HookRegistry;
  readonly registry: PluginRegistry;
  /**
   * Plugin-contributed AppContext helpers from
   * `provides(ctx).extendAppContext(...)`. Runtime adapters merge these
   * onto each per-request `AppContext` so any handler — RPC, route,
   * scheduled, or hook listener via `requestStore.getStore()` — reads
   * them as `ctx.<key>`.
   */
  readonly appContextExtensions: ReadonlyMap<string, ContextExtensionEntry>;
}

interface InstallPluginsArgs {
  readonly hooks: HookRegistry;
  readonly plugins: readonly AnyPluginDescriptor[];
  readonly registry?: MutablePluginRegistry;
  /**
   * Handed to every plugin as `ctx.theme`. Defaults to a theme declaring
   * nothing, for a caller installing plugins without a site.
   */
  readonly theme?: ThemeDescriptor;
  /** Where dev registrations land; `undefined` outside the dev gate. */
  readonly dev?: MutableDevRuntime;
}

export async function installPlugins({
  hooks,
  plugins,
  registry = createPluginRegistry(),
  theme = { templates: [] },
  dev,
}: InstallPluginsArgs): Promise<PluginInstallResult> {
  const seenIds = new Set<string>();
  for (const descriptor of plugins) {
    // Re-check in case the descriptor was hand-rolled.
    assertValidPluginId(descriptor.id);
    if (seenIds.has(descriptor.id)) {
      throw PluginDefinitionError.duplicatePluginIdInConfig({
        pluginId: descriptor.id,
      });
    }
    seenIds.add(descriptor.id);
    registry.pluginIds.push(descriptor.id);
  }
  assertUniqueDeclarations(plugins);

  // Per call, not per descriptor: the same descriptor installed into two apps
  // gets two states.
  const states: unknown[] = [];
  for (const descriptor of plugins) {
    states.push(await descriptor.state?.());
  }

  const pluginExtensions = new Map<string, ContextExtensionEntry>();
  const appContextExtensions = new Map<string, ContextExtensionEntry>();
  for (const [index, descriptor] of plugins.entries()) {
    if (!descriptor.provides) continue;
    const providesCtx = createPluginProvidesContext({
      pluginId: descriptor.id,
      pluginExtensions,
      appExtensions: appContextExtensions,
    });
    await descriptor.provides(providesCtx, states[index]);
  }

  const mergedPluginExtensions = new Map<string, unknown>();
  for (const [key, entry] of pluginExtensions) {
    mergedPluginExtensions.set(key, entry.value);
  }

  for (const [index, descriptor] of plugins.entries()) {
    const ctx = createPluginSetupContext({
      pluginId: descriptor.id,
      hooks,
      registry,
      theme,
      dev,
      extensions: mergedPluginExtensions,
    });
    for (const spec of descriptor.shortcodes ?? []) {
      ctx.registerShortcode(spec);
    }
    await descriptor.setup(ctx, states[index]);
  }

  for (const [index, descriptor] of plugins.entries()) {
    if (!descriptor.afterSetup) continue;
    const ctx = createPluginAfterSetupContext({
      pluginId: descriptor.id,
      hooks,
      registry,
      theme,
      dev,
      extensions: mergedPluginExtensions,
    });
    await descriptor.afterSetup(ctx, states[index]);
  }

  assertKnownScopes(hooks, registry);

  return { hooks, registry, appContextExtensions };
}

type Declaration = AnyEventDefinition | AnyFilterDefinition;

const CORE_DECLARATIONS: readonly Declaration[] = [
  ...Object.values(block),
  ...Object.values(render),
  ...Object.values(sync),
  ...Object.values(user),
  ...Object.values(auth),
  ...entryDeclarations,
  ...termDeclarations,
  ...rpcFilterDeclarations,
];

/**
 * After every plugin's `setup`, so a scope may name a type a later plugin
 * registers; a typo would otherwise drop its handler without a word.
 */
function assertKnownScopes(
  hooks: HookRegistry,
  registry: PluginRegistry,
): void {
  const subjects = [
    {
      ids: new Set(entryDeclarations.map(({ id }) => id)),
      kind: "entry type",
      registered: registry.entryTypes,
    },
    {
      ids: new Set(termDeclarations.map(({ id }) => id)),
      kind: "taxonomy",
      registered: registry.termTaxonomies,
    },
  ];
  for (const { id, scope, plugin } of hooks.scopedSubscriptions()) {
    const subject = subjects.find(({ ids }) => ids.has(id));
    if (subject === undefined || subject.registered.has(scope)) continue;
    throw PluginDefinitionError.handlerScopedToUnknownName({
      pluginId: plugin ?? "core",
      declarationId: id,
      kind: subject.kind,
      scope,
      registered: [...subject.registered.keys()].sort(),
    });
  }
}

function assertUniqueDeclarations(
  plugins: readonly AnyPluginDescriptor[],
): void {
  const owners = new Map<string, string | null>(
    CORE_DECLARATIONS.map((declaration) => [declaration.id, null]),
  );
  for (const descriptor of plugins) {
    const declarations: readonly Declaration[] = [
      ...(descriptor.events ?? []),
      ...(descriptor.filters ?? []),
    ];
    for (const declaration of declarations) {
      const owner = owners.get(declaration.id);
      if (owner !== undefined) {
        throw DuplicateRegistrationError.alreadyRegistered({
          kind: declaration.kind,
          identifier: declaration.id,
          pluginId: descriptor.id,
          previousOwner: owner,
        });
      }
      owners.set(declaration.id, descriptor.id);
    }
  }
}

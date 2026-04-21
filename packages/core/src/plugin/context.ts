import type { DerivedCapability } from "../auth/rbac.js";
import type { UserRole } from "../db/schema/users.js";
import type { HookRegistry } from "../hooks/registry.js";
import type {
  ActionArgs,
  ActionFn,
  ActionName,
  FilterFn,
  FilterInput,
  FilterName,
  FilterRest,
  HookOptions,
} from "../hooks/types.js";
import type {
  MetaBoxOptions,
  MetaOptions,
  MutablePluginRegistry,
  PostTypeOptions,
  TaxonomyOptions,
} from "./manifest.js";
import {
  derivePostTypeCapabilities,
  deriveTaxonomyCapabilities,
} from "../auth/rbac.js";
import { DuplicateRegistrationError } from "./manifest.js";

export interface PluginSetupContext {
  readonly id: string;

  /** Subscribe to an existing (core or other-plugin) filter. */
  addFilter<TName extends FilterName>(
    name: TName,
    fn: FilterFn<TName>,
    options?: HookOptions,
  ): void;

  /** Subscribe to an existing (core or other-plugin) action. */
  addAction<TName extends ActionName>(
    name: TName,
    fn: ActionFn<TName>,
    options?: HookOptions,
  ): void;

  /**
   * Declare a plugin-owned filter. The short name is auto-prefixed with the
   * plugin id — `ctx.registerFilter('meta_tags', ...)` becomes `<plugin>:meta_tags`.
   * Other plugins listen via the full prefixed name.
   */
  registerFilter<TName extends FilterName>(
    shortName: string,
    fn: FilterFn<TName>,
    options?: HookOptions,
  ): void;

  registerAction<TName extends ActionName>(
    shortName: string,
    fn: ActionFn<TName>,
    options?: HookOptions,
  ): void;

  registerPostType(name: string, options: PostTypeOptions): void;
  registerTaxonomy(name: string, options: TaxonomyOptions): void;
  registerMeta(key: string, options: MetaOptions): void;
  registerMetaBox(id: string, options: MetaBoxOptions): void;
  registerCapability(name: string, minRole: UserRole): void;
}

interface CreatePluginContextArgs {
  readonly pluginId: string;
  readonly hooks: HookRegistry;
  readonly registry: MutablePluginRegistry;
}

export function createPluginSetupContext({
  pluginId,
  hooks,
  registry,
}: CreatePluginContextArgs): PluginSetupContext {
  // First writer wins — sharing a capabilityType across post types is the
  // supported way to pool permissions, so derived caps must not throw on
  // conflict. Explicit `registerCapability` still does.
  const addDerivedCaps = (caps: readonly DerivedCapability[]): void => {
    for (const cap of caps) {
      if (registry.capabilities.has(cap.name)) continue;
      registry.capabilities.set(cap.name, { ...cap, registeredBy: pluginId });
    }
  };

  return {
    id: pluginId,

    addFilter: (name, fn, options) => {
      hooks.addFilter(name, fn, { ...options, plugin: pluginId });
    },

    addAction: (name, fn, options) => {
      hooks.addAction(name, fn, { ...options, plugin: pluginId });
    },

    registerFilter: (shortName, fn, options) => {
      const prefixed = `${pluginId}:${shortName}` as FilterName;
      hooks.addFilter(prefixed, fn as FilterFn<FilterName>, {
        ...options,
        plugin: pluginId,
      });
    },

    registerAction: (shortName, fn, options) => {
      const prefixed = `${pluginId}:${shortName}` as ActionName;
      hooks.addAction(prefixed, fn, {
        ...options,
        plugin: pluginId,
      });
    },

    registerPostType: (name, options) => {
      if (registry.postTypes.has(name))
        throw new DuplicateRegistrationError("post type", name);
      registry.postTypes.set(name, {
        ...options,
        name,
        registeredBy: pluginId,
      });
      addDerivedCaps(derivePostTypeCapabilities(name, options));
    },

    registerTaxonomy: (name, options) => {
      if (registry.taxonomies.has(name))
        throw new DuplicateRegistrationError("taxonomy", name);
      registry.taxonomies.set(name, {
        ...options,
        name,
        registeredBy: pluginId,
      });
      addDerivedCaps(deriveTaxonomyCapabilities(name));
    },

    registerMeta: (key, options) => {
      if (registry.metaKeys.has(key))
        throw new DuplicateRegistrationError("meta key", key);
      registry.metaKeys.set(key, { ...options, key, registeredBy: pluginId });
    },

    registerMetaBox: (id, options) => {
      if (registry.metaBoxes.has(id))
        throw new DuplicateRegistrationError("meta box", id);
      registry.metaBoxes.set(id, { ...options, id, registeredBy: pluginId });
    },

    registerCapability: (name, minRole) => {
      if (registry.capabilities.has(name)) {
        throw new DuplicateRegistrationError("capability", name);
      }
      registry.capabilities.set(name, {
        name,
        minRole,
        registeredBy: pluginId,
      });
    },
  };
}

// Re-exported from our local FilterRest helper so the type used by hook wrapper
// logic is expressible at call sites without digging into internals.
export type { ActionArgs, FilterInput, FilterRest };

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
import type { RouteIntent } from "../route/intent.js";
import type {
  MetaBoxOptions,
  MetaOptions,
  MutablePluginRegistry,
  PostTypeOptions,
  SettingsFieldset,
  SettingsGroupOptions,
  TaxonomyOptions,
} from "./manifest.js";
import {
  derivePostTypeCapabilities,
  deriveTaxonomyCapabilities,
} from "../auth/rbac.js";
import { DEFAULT_REWRITE_RULE_PRIORITY } from "../route/compile.js";
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

  /**
   * Declare a top-level settings group — its own `/settings/$name`
   * admin page, populated by the group's fieldsets. Throws
   * `DuplicateRegistrationError` if another plugin already registered
   * the same name; use `registerSettingsFieldset` to append a section
   * to an existing group.
   */
  registerSettingsGroup(name: string, options: SettingsGroupOptions): void;

  /**
   * Append a fieldset (WP's `add_settings_section` analogue) to an
   * existing settings group. Throws if the group isn't registered yet
   * (plugin install order matters), if the fieldset name collides
   * with one already on the group, or if any field inside it collides
   * with a field name anywhere else in the group (storage keys are
   * flat across fieldsets).
   */
  registerSettingsFieldset(groupName: string, fieldset: SettingsFieldset): void;

  /**
   * Declare a public URL → `RouteIntent` mapping. Lands in the compiled
   * route map at `buildApp`; `URLPattern` pathname syntax (e.g. `/:slug`,
   * `/docs/:category/:slug`). `priority` defaults to 10 — lower wins,
   * auto-generated archive/single rules from `registerPostType` sit at 50.
   */
  addRewriteRule(
    pattern: string,
    intent: RouteIntent,
    options?: { readonly priority?: number },
  ): void;
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

    registerSettingsGroup: (name, options) => {
      assertValidIdentifier("settings group", name);
      if (registry.settingsGroups.has(name)) {
        throw new DuplicateRegistrationError("settings group", name);
      }
      for (const fs of options.fieldsets)
        assertValidIdentifier("settings fieldset", fs.name);
      for (const fs of options.fieldsets) {
        for (const field of fs.fields)
          assertValidIdentifier("settings field", field.name);
      }
      assertUniqueFieldNamesAcrossFieldsets(name, options.fieldsets);
      assertGroupFieldCountWithinBounds(name, options.fieldsets);
      registry.settingsGroups.set(name, {
        ...options,
        name,
        registeredBy: pluginId,
      });
    },

    addRewriteRule: (pattern, intent, options) => {
      registry.rewriteRules.push({
        pattern,
        intent,
        priority: options?.priority ?? DEFAULT_REWRITE_RULE_PRIORITY,
        registeredBy: pluginId,
      });
    },

    registerSettingsFieldset: (groupName, fieldset) => {
      const existing = registry.settingsGroups.get(groupName);
      if (existing === undefined) {
        throw new Error(
          `Cannot add fieldset to settings group "${groupName}" — it hasn't been registered yet. ` +
            `Ensure the plugin that calls \`registerSettingsGroup\` runs before this one.`,
        );
      }
      assertValidIdentifier("settings fieldset", fieldset.name);
      for (const field of fieldset.fields)
        assertValidIdentifier("settings field", field.name);
      if (existing.fieldsets.some((fs) => fs.name === fieldset.name)) {
        throw new DuplicateRegistrationError(
          "settings fieldset",
          `${groupName}.${fieldset.name}`,
        );
      }
      const next = [...existing.fieldsets, fieldset];
      assertUniqueFieldNamesAcrossFieldsets(groupName, next);
      assertGroupFieldCountWithinBounds(groupName, next);
      registry.settingsGroups.set(groupName, {
        ...existing,
        fieldsets: next,
      });
    },
  };
}

// Keep group / fieldset / field names portable: ASCII identifier that
// starts with a letter, then letters/digits/underscores. This is
// tighter than `optionNameSchema`'s regex (which allows `.`/`-`) on
// purpose — dots in names would collide with the flat storage-key
// convention (`${group}.${field}`), and hyphens make testids and
// URL params awkward.
const SETTINGS_NAME_RE = /^[a-z][a-z0-9_]*$/;

function assertValidIdentifier(kind: string, name: string): void {
  if (!SETTINGS_NAME_RE.test(name)) {
    throw new Error(
      `Invalid ${kind} name "${name}" — expected lowercase ASCII ` +
        `[a-z][a-z0-9_]* so storage keys, testids, and URLs stay portable.`,
    );
  }
}

// Storage keys are flat (`${groupName}.${fieldName}`), so two fieldsets
// within the same group can't declare the same field name — they'd
// collide on disk. Enforced at registration time so plugin authors
// fail fast rather than quietly overwriting each other's values.
function assertUniqueFieldNamesAcrossFieldsets(
  groupName: string,
  fieldsets: readonly {
    readonly fields: readonly { readonly name: string }[];
  }[],
): void {
  const seen = new Set<string>();
  for (const fs of fieldsets) {
    for (const field of fs.fields) {
      if (seen.has(field.name)) {
        throw new DuplicateRegistrationError(
          "settings field",
          `${groupName}.${field.name}`,
        );
      }
      seen.add(field.name);
    }
  }
}

// Mirror the RPC's `option.getMany` 200-name cap so a plugin that
// over-registers fails at registration time rather than at route-load
// time with a generic error. If a real CMS ever needs >200 fields in
// one group, bump both limits together — the admin loader would need
// to chunk the fetch to stay under the server cap.
const MAX_FIELDS_PER_SETTINGS_GROUP = 200;

function assertGroupFieldCountWithinBounds(
  groupName: string,
  fieldsets: readonly {
    readonly fields: readonly { readonly name: string }[];
  }[],
): void {
  const total = fieldsets.reduce((sum, fs) => sum + fs.fields.length, 0);
  if (total > MAX_FIELDS_PER_SETTINGS_GROUP) {
    throw new Error(
      `Settings group "${groupName}" has ${total} fields; ` +
        `the admin loader caps a single group at ${MAX_FIELDS_PER_SETTINGS_GROUP}. ` +
        `Split into multiple groups or chunk the loader.`,
    );
  }
}

// Re-exported from our local FilterRest helper so the type used by hook wrapper
// logic is expressible at call sites without digging into internals.
export type { ActionArgs, FilterInput, FilterRest };

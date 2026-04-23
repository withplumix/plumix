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
  EntryMetaBoxOptions,
  EntryTypeOptions,
  MutablePluginRegistry,
  SettingsGroupOptions,
  SettingsPageOptions,
  TaxonomyOptions,
  TermMetaBoxOptions,
} from "./manifest.js";
import {
  deriveEntryTypeCapabilities,
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

  registerEntryType(name: string, options: EntryTypeOptions): void;
  registerTaxonomy(name: string, options: TaxonomyOptions): void;
  /**
   * Declare a meta box on the entry editor sidebar. The fields inside
   * the box drive both the admin input rendering and the server-side
   * storage schema (type + sanitize) — there is no separate
   * `registerMeta` step. Throws `DuplicateRegistrationError` on id
   * collision; `buildManifest` rejects two boxes writing to the same
   * `(entryType, field.key)` pair.
   */
  registerEntryMetaBox(id: string, options: EntryMetaBoxOptions): void;
  /**
   * Same model as `registerEntryMetaBox`, but scoped to taxonomies and
   * rendered on the term edit form as one stacked shadcn `<Card>` per
   * box. `registerTermMeta` is not a separate step — the box's fields
   * are the meta key contract.
   */
  registerTermMetaBox(id: string, options: TermMetaBoxOptions): void;
  registerCapability(name: string, minRole: UserRole): void;

  /**
   * Declare a standalone settings group — a storage unit (fields land
   * under `settings(group.name, field.name)`) and a visual unit
   * (rendered as one shadcn `<Card>` in the admin with its own save
   * button in the card footer). Throws `DuplicateRegistrationError` if
   * another plugin already registered the same name. Reference the
   * group from one or more `registerSettingsPage` calls to surface it
   * in the admin.
   */
  registerSettingsGroup(name: string, options: SettingsGroupOptions): void;

  /**
   * Declare a settings page (admin URL `/settings/<name>`) that
   * composes one or more registered groups. Pages are pure admin-UI
   * metadata — they aren't stored. Throws
   * `DuplicateRegistrationError` on name collision; group references
   * are validated at manifest-build time (`buildManifest`), not here,
   * so plugin install order doesn't matter.
   */
  registerSettingsPage(name: string, options: SettingsPageOptions): void;

  /**
   * Declare a public URL → `RouteIntent` mapping. Lands in the compiled
   * route map at `buildApp`; `URLPattern` pathname syntax (e.g. `/:slug`,
   * `/docs/:category/:slug`). `priority` defaults to 10 — lower wins,
   * auto-generated archive/single rules from `registerEntryType` sit at 50.
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
  // First writer wins — sharing a capabilityType across entry types is the
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

    registerEntryType: (name, options) => {
      if (registry.entryTypes.has(name))
        throw new DuplicateRegistrationError("entry type", name);
      registry.entryTypes.set(name, {
        ...options,
        name,
        registeredBy: pluginId,
      });
      addDerivedCaps(deriveEntryTypeCapabilities(name, options));
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

    registerEntryMetaBox: (id, options) => {
      if (registry.entryMetaBoxes.has(id)) {
        throw new DuplicateRegistrationError("entry meta box", id);
      }
      registry.entryMetaBoxes.set(id, {
        ...options,
        id,
        registeredBy: pluginId,
      });
    },

    registerTermMetaBox: (id, options) => {
      if (registry.termMetaBoxes.has(id)) {
        throw new DuplicateRegistrationError("term meta box", id);
      }
      registry.termMetaBoxes.set(id, {
        ...options,
        id,
        registeredBy: pluginId,
      });
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
      for (const field of options.fields)
        assertValidIdentifier("settings field", field.name);
      assertUniqueFieldNames(name, options.fields);
      assertGroupFieldCountWithinBounds(name, options.fields);
      registry.settingsGroups.set(name, {
        ...options,
        name,
        registeredBy: pluginId,
      });
    },

    registerSettingsPage: (name, options) => {
      assertValidIdentifier("settings page", name);
      if (registry.settingsPages.has(name)) {
        throw new DuplicateRegistrationError("settings page", name);
      }
      for (const groupName of options.groups) {
        assertValidIdentifier("settings group reference", groupName);
      }
      if (new Set(options.groups).size !== options.groups.length) {
        throw new Error(
          `Settings page "${name}" lists a group more than once; ` +
            `each group may appear at most once per page.`,
        );
      }
      registry.settingsPages.set(name, {
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
  };
}

// Keep page / group / field names portable: ASCII identifier that
// starts with a letter, then letters/digits/underscores. Hyphens /
// dots are excluded so testids, URL params, and storage keys stay
// portable across SQLite / future MySQL without quoting. Length cap
// mirrors the valibot `settingsIdentifierSchema` on the RPC side so a
// plugin can't register a name its own `settings.get` / `.upsert`
// calls would then reject.
const SETTINGS_NAME_RE = /^[a-z][a-z0-9_]*$/;
const MAX_SETTINGS_IDENTIFIER_LENGTH = 64;

function assertValidIdentifier(kind: string, name: string): void {
  if (name.length > MAX_SETTINGS_IDENTIFIER_LENGTH) {
    throw new Error(
      `Invalid ${kind} name "${name}" — names are capped at ` +
        `${MAX_SETTINGS_IDENTIFIER_LENGTH} characters to match the RPC ` +
        `input schema.`,
    );
  }
  if (!SETTINGS_NAME_RE.test(name)) {
    throw new Error(
      `Invalid ${kind} name "${name}" — expected lowercase ASCII ` +
        `[a-z][a-z0-9_]* so storage keys, testids, and URLs stay portable.`,
    );
  }
}

function assertUniqueFieldNames(
  groupName: string,
  fields: readonly { readonly name: string }[],
): void {
  const seen = new Set<string>();
  for (const field of fields) {
    if (seen.has(field.name)) {
      throw new DuplicateRegistrationError(
        "settings field",
        `${groupName}.${field.name}`,
      );
    }
    seen.add(field.name);
  }
}

// Cap on fields per group — keeps the admin `settings.upsert` payload
// bounded and signals a modeling problem if a plugin wants to pile
// hundreds of fields into one card. If a real need ever shows up,
// bump this alongside the RPC input cap.
const MAX_FIELDS_PER_SETTINGS_GROUP = 200;

function assertGroupFieldCountWithinBounds(
  groupName: string,
  fields: readonly { readonly name: string }[],
): void {
  if (fields.length > MAX_FIELDS_PER_SETTINGS_GROUP) {
    throw new Error(
      `Settings group "${groupName}" has ${fields.length} fields; ` +
        `the admin caps a single group at ${MAX_FIELDS_PER_SETTINGS_GROUP}. ` +
        `Split into multiple groups.`,
    );
  }
}

// Re-exported from our local FilterRest helper so the type used by hook wrapper
// logic is expressible at call sites without digging into internals.
export type { ActionArgs, FilterInput, FilterRest };

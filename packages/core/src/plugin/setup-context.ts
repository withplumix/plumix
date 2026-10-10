import type { DerivedCapability } from "../access/contract/rbac.js";
import type { UserRole } from "../db/schema/users.js";
import type { HookRegistry } from "../hooks/registry.js";
import type { ActionName, FilterFn, FilterName } from "../hooks/types.js";
import type {
  RegisteredTemplateDep,
  TemplateDepKeys,
} from "../template-deps.js";
import type {
  MetaBoxFieldInput,
  MutablePluginRegistry,
  ViewOptions,
} from "./manifest.js";
import type { PluginContextExtensions } from "./provides-context.js";
import type {
  PluginAfterSetupContext,
  PluginSetupContext,
  PluginSetupContextBase,
} from "./setup-context-types.js";
import {
  deriveEntryTypeCapabilities,
  deriveTermTaxonomyCapabilities,
} from "../access/contract/rbac.js";
import { isReservedBlockName } from "../blocks/index.js";
import { isPrivateSettingsGroup } from "../db/settings-groups.js";
import { CORE_MCP_TOOL_NAMES } from "../mcp/registry.js";
import { DEFAULT_REWRITE_RULE_PRIORITY } from "../route/compile.js";
import { CORE_RPC_NAMESPACES } from "../rpc/namespaces.js";
import { RESERVED_DEP_KIND_NAMES } from "../template-deps.js";
import { DuplicateRegistrationError, PluginContextError } from "./errors.js";
import { compileMetaBoxFields } from "./manifest.js";
import { toRegisteredEntryType, toRegisteredTermTaxonomy } from "./registry.js";
import {
  assertComponentRef,
  assertMetaBoxFields,
  assertNamespacedId,
  assertValidAdminPagePath,
  assertValidFieldTypeName,
  assertValidIdentifier,
  assertValidLoginLink,
  assertValidLookupAdapterKind,
  assertValidNavGroupId,
  assertValidPluginRoutePath,
  assertValidPublicRoutePath,
  assertValidRestResourcePath,
  assertValidScheduledTask,
} from "./validation/index.js";

interface CreatePluginContextArgs {
  readonly pluginId: string;
  readonly hooks: HookRegistry;
  readonly registry: MutablePluginRegistry;
  readonly extensions?: ReadonlyMap<string, unknown>;
}

export function createPluginSetupContext(
  args: CreatePluginContextArgs,
): PluginSetupContext {
  return withExtensions(createContextBase(args), args.extensions);
}

export function createPluginAfterSetupContext(
  args: CreatePluginContextArgs,
): PluginAfterSetupContext {
  return withExtensions(
    { ...createContextBase(args), plugins: args.registry },
    args.extensions,
  );
}

function createContextBase({
  pluginId,
  hooks,
  registry,
}: CreatePluginContextArgs): PluginSetupContextBase {
  // Pooling caps by capabilityType is safe when minRoles agree; if one
  // type applies a `capabilities` override and another doesn't, silent
  // first-writer-wins would tie the resolved cap to registration order.
  const addDerivedCaps = (caps: readonly DerivedCapability[]): void => {
    for (const cap of caps) {
      const existing = registry.capabilities.get(cap.name);
      if (existing) {
        if (existing.minRole !== cap.minRole) {
          throw PluginContextError.derivedCapabilityMinRoleMismatch({
            pluginId,
            capName: cap.name,
            minRole: cap.minRole,
            existingMinRole: existing.minRole,
            existingOwner: existing.registeredBy ?? "<unknown>",
          });
        }
        continue;
      }
      registry.capabilities.set(cap.name, { ...cap, registeredBy: pluginId });
    }
  };

  const ctx: PluginSetupContextBase = {
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
      const registered = claimKey(
        registry.entryTypes,
        "entry type",
        name,
        pluginId,
        () => toRegisteredEntryType(name, options, pluginId),
      );
      addDerivedCaps(deriveEntryTypeCapabilities(registered));
    },

    registerTermTaxonomy: (name, options) => {
      claimKey(registry.termTaxonomies, "term taxonomy", name, pluginId, () =>
        toRegisteredTermTaxonomy(name, options, pluginId),
      );
      addDerivedCaps(deriveTermTaxonomyCapabilities(name, options));
    },

    registerEntryMetaBox: makeMetaBoxRegistrar(
      registry.entryMetaBoxes,
      "entry meta box",
      pluginId,
    ),
    registerTermMetaBox: makeMetaBoxRegistrar(
      registry.termMetaBoxes,
      "term meta box",
      pluginId,
    ),
    registerUserMetaBox: makeMetaBoxRegistrar(
      registry.userMetaBoxes,
      "user meta box",
      pluginId,
    ),

    registerCapability: (
      name: string,
      minRoleOrOptions:
        UserRole | { minRole: UserRole; defaultGrants?: readonly UserRole[] },
    ) => {
      claimKey(registry.capabilities, "capability", name, pluginId, () => {
        const resolved =
          typeof minRoleOrOptions === "string"
            ? { minRole: minRoleOrOptions, defaultGrants: undefined }
            : {
                minRole: minRoleOrOptions.minRole,
                defaultGrants: minRoleOrOptions.defaultGrants,
              };
        return {
          name,
          minRole: resolved.minRole,
          defaultGrants: resolved.defaultGrants
            ? [...new Set(resolved.defaultGrants)].sort()
            : undefined,
          registeredBy: pluginId,
        };
      });
    },

    registerSettingsGroup: (name, options) => {
      assertValidIdentifier("settings group", name);
      if (isPrivateSettingsGroup(name)) {
        throw PluginContextError.settingsGroupReserved({ pluginId, name });
      }
      claimKey(
        registry.settingsGroups,
        "settings group",
        name,
        pluginId,
        () => {
          const fields = compileMetaBoxFields(options.fields);
          assertMetaBoxFields("settings group", name, fields);
          return { ...options, fields, name, registeredBy: pluginId };
        },
      );
    },

    registerSettingsPage: (name, options) => {
      assertValidIdentifier("settings page", name);
      claimKey(registry.settingsPages, "settings page", name, pluginId, () => {
        for (const groupName of options.groups) {
          assertValidIdentifier("settings group reference", groupName);
        }
        if (new Set(options.groups).size !== options.groups.length) {
          throw PluginContextError.settingsPageDuplicateGroup({ name });
        }
        return { ...options, name, registeredBy: pluginId };
      });
    },

    registerRewriteRule: (pattern, intent, options) => {
      registry.rewriteRules.push({
        pattern,
        intent,
        priority: options?.priority ?? DEFAULT_REWRITE_RULE_PRIORITY,
        registeredBy: pluginId,
      });
    },

    registerRedirects: (rules) => {
      registry.redirects.push(...rules);
    },

    registerArchiveType: (name, options) => {
      claimKey(registry.archiveTypes, "archive type", name, pluginId, () => ({
        ...options,
        name,
        registeredBy: pluginId,
      }));
    },

    registerView: (name, options) => {
      claimKey(registry.views, "view", name, pluginId, () => ({
        // Safety: the resolver's `data` was checked against `ViewRegistry` at
        // the call site; the registry holds every view's as `unknown`.
        ...(options as ViewOptions),
        name,
        registeredBy: pluginId,
      }));
    },

    registerRpcRouter: (router) => {
      if (CORE_RPC_NAMESPACES.has(pluginId)) {
        throw PluginContextError.pluginIdCollidesWithCoreRpcNamespace({
          pluginId,
          coreNamespaces: [...CORE_RPC_NAMESPACES],
        });
      }
      // Keyed by the plugin's own id, so only the plugin itself can hold it.
      assertUnclaimed(
        "plugin RPC router",
        pluginId,
        pluginId,
        registry.rpcRouters.has(pluginId)
          ? { registeredBy: pluginId }
          : undefined,
      );
      registry.rpcRouters.set(pluginId, router);
    },

    registerMcpTool: (tool) => {
      // Core's tools are served outside the registry, so their names are
      // claimed here rather than by a seeded entry.
      assertUnclaimed(
        "MCP tool",
        tool.name,
        pluginId,
        CORE_MCP_TOOL_NAMES.has(tool.name) ? { registeredBy: null } : undefined,
      );
      claimKey(registry.mcpTools, "MCP tool", tool.name, pluginId, () => ({
        tool,
        registeredBy: pluginId,
      }));
    },

    registerRoute: ({ method, path, auth, cacheable, formPost, handler }) => {
      assertValidPluginRoutePath(pluginId, path);
      if (auth !== "public") {
        if (cacheable === true) {
          throw PluginContextError.cacheableRouteNotPublic({
            pluginId,
            method,
            path,
          });
        }
        if (formPost === true) {
          throw PluginContextError.formPostRouteNotPublic({
            pluginId,
            method,
            path,
          });
        }
      }
      const existing = registry.rawRoutes.find(
        (route) =>
          route.pluginId === pluginId &&
          route.method === method &&
          route.path === path,
      );
      assertUnclaimed(
        "route",
        `${method} ${path}`,
        pluginId,
        existing && { registeredBy: existing.pluginId },
      );
      registry.rawRoutes.push({
        pluginId,
        method,
        path,
        auth,
        cacheable,
        formPost,
        handler,
      });
    },

    registerPublicRoute: (options) => {
      assertValidPublicRoutePath(pluginId, options.path);
      // Collisions are a boot check, not a registration one: a plugin registers
      // from `afterSetup`, so the full set exists only once every plugin has.
      registry.publicRoutes.push({ ...options, pluginId });
    },

    registerRestResource: (options) => {
      assertValidRestResourcePath(pluginId, options.path);
      // Cross-resource path collisions are validated at boot (buildApp), where
      // the full set across all plugins + core reserved paths is known.
      registry.restResources.push({
        ...options,
        pluginId,
        method: options.method ?? "GET",
      });
    },

    registerAdminPage: (options) => {
      assertValidAdminPagePath(pluginId, options.path);
      claimKey(
        registry.adminPages,
        "admin page",
        options.path,
        pluginId,
        () => {
          assertComponentRef(
            pluginId,
            `admin page "${options.path}"`,
            options.component,
          );
          if (options.nav) {
            const groupId =
              typeof options.nav.group === "string"
                ? options.nav.group
                : options.nav.group.id;
            assertValidNavGroupId(pluginId, groupId);
          }
          return { ...options, registeredBy: pluginId };
        },
      );
    },

    registerDashboardWidget: (options) => {
      assertNamespacedId("dashboard widget id", options.id, pluginId);
      claimKey(
        registry.dashboardWidgets,
        "dashboard widget",
        options.id,
        pluginId,
        () => {
          assertComponentRef(
            pluginId,
            `dashboard widget "${options.id}"`,
            options.component,
          );
          return { ...options, registeredBy: pluginId };
        },
      );
    },

    registerFieldType: (options) => {
      assertValidFieldTypeName(pluginId, options.type);
      claimKey(
        registry.fieldTypes,
        "field type",
        options.type,
        pluginId,
        () => {
          assertComponentRef(
            pluginId,
            `field type "${options.type}"`,
            options.component,
          );
          return { ...options, registeredBy: pluginId };
        },
      );
    },

    registerBlock: (spec) => {
      if (isReservedBlockName(spec.name)) {
        throw PluginContextError.blockNameReserved({
          pluginId,
          name: spec.name,
        });
      }
      claimKey(registry.blockSpecs, "block", spec.name, pluginId, () => ({
        spec,
        registeredBy: pluginId,
      }));
    },

    registerBlocks: (specs) => {
      for (const spec of specs) ctx.registerBlock(spec);
    },

    registerMark: (spec) => {
      claimKey(registry.markSpecs, "mark", spec.name, pluginId, () => ({
        spec,
        registeredBy: pluginId,
      }));
    },

    registerShortcode: (spec) => {
      claimKey(
        registry.shortcodeSpecs,
        "shortcode",
        spec.name,
        pluginId,
        () => ({
          spec,
          registeredBy: pluginId,
        }),
      );
    },

    registerPattern: (spec) => {
      claimKey(registry.patternSpecs, "pattern", spec.name, pluginId, () => ({
        spec,
        registeredBy: pluginId,
      }));
    },

    registerImageRole: (name, { single }) => {
      claimKey(registry.imageRoles, "image role", name, pluginId, () => ({
        name,
        single,
        registeredBy: pluginId,
      }));
    },

    registerLookupAdapter: (options) => {
      assertValidLookupAdapterKind(pluginId, options.kind);
      // Spread to preserve plugin-contributed option fields (e.g. the
      // `menuPicker` field that @plumix/plugin-menu adds via declaration
      // merging).
      claimKey(
        registry.lookupAdapters,
        "lookup adapter",
        options.kind,
        pluginId,
        () => ({
          ...options,
          capability: options.capability ?? null,
          registeredBy: pluginId,
        }),
      );
    },

    registerLoginLink: (options) => {
      assertValidLoginLink(pluginId, options);
      assertUnclaimed(
        "login link",
        options.key,
        pluginId,
        registry.loginLinks.find(
          (link) => link.registeredBy === pluginId && link.key === options.key,
        ),
      );
      registry.loginLinks.push({
        ...options,
        registeredBy: pluginId,
      });
    },

    registerScheduledTask: (task) => {
      assertValidScheduledTask(pluginId, task);
      assertUnclaimed(
        "scheduled task",
        task.id,
        pluginId,
        registry.scheduledTasks.find(
          (existing) =>
            existing.registeredBy === pluginId && existing.id === task.id,
        ),
      );
      registry.scheduledTasks.push({
        ...task,
        registeredBy: pluginId,
      });
    },

    registerTemplateDep: (kind, { keyedBy, load }) => {
      if (RESERVED_DEP_KIND_NAMES.has(kind)) {
        // Reserved framework keys would silently no-op at request time
        // since the merger skips them on theme/template traversal.
        throw PluginContextError.templateDepKindReserved({
          pluginId,
          kind,
        });
      }
      claimKey(registry.templateDeps, "template dep", kind, pluginId, () => {
        const name = `${keyedBy}s`;
        const erased: RegisteredTemplateDep["load"] = (keys, ctx) =>
          // `keyedBy` is typed to the entry's key field, so this object is
          // exactly the one named array the loader was typed against.
          load({ [name]: keys } as TemplateDepKeys<typeof kind>, ctx);
        return { kind, load: erased, registeredBy: pluginId };
      });
    },
  };

  return ctx;
}

interface Owned {
  readonly registeredBy: string | null;
}

/**
 * The one place a duplicate registration is raised, so every registry reports
 * who already holds the identifier the same way.
 */
function assertUnclaimed(
  kind: string,
  identifier: string,
  pluginId: string,
  existing: Owned | undefined,
): void {
  if (existing === undefined) return;
  throw DuplicateRegistrationError.alreadyRegistered({
    kind,
    identifier,
    pluginId,
    previousOwner: existing.registeredBy,
  });
}

/**
 * `build` runs between the check and the write, so a registrar's remaining
 * validation keeps its place after the duplicate check and a throw from it
 * leaves the registry untouched.
 */
function claimKey<V extends Owned>(
  map: Map<string, V>,
  kind: string,
  key: string,
  pluginId: string,
  build: () => V,
): V {
  assertUnclaimed(kind, key, pluginId, map.get(key));
  const value = build();
  map.set(key, value);
  return value;
}

function withExtensions<TContext extends PluginSetupContextBase>(
  ctx: TContext,
  extensions: ReadonlyMap<string, unknown> | undefined,
): TContext & PluginContextExtensions {
  if (extensions && extensions.size > 0) {
    // Safety: the write is keyed, never structural — every key that already
    // exists is rejected below, so no declared field of the setup context can
    // be reached through this view.
    const target = ctx as unknown as Record<string, unknown>;
    for (const [key, value] of extensions) {
      // `plugins` is named because the setup context lacks it, so `in` alone
      // would reject the key only once some plugin declared `afterSetup`.
      if (key in target || key === "plugins") {
        throw PluginContextError.extensionShadowsBuiltin({ key });
      }
      target[key] = value;
    }
  }

  return ctx as TContext & PluginContextExtensions;
}

/**
 * Fluent builders compile to plain definitions here, so everything downstream
 * carries `MetaBoxField` only.
 */
function makeMetaBoxRegistrar<R extends Owned & { readonly id: string }>(
  map: Map<string, R>,
  kind: string,
  pluginId: string,
): (
  id: string,
  options: { readonly fields: readonly MetaBoxFieldInput[] },
) => void {
  return (id, options) => {
    claimKey(map, kind, id, pluginId, () => {
      const fields = compileMetaBoxFields(options.fields);
      assertMetaBoxFields(kind, id, fields);
      // Safety: `R`'s remaining members ride in on `options`, which the caller
      // passes whole; the parameter type narrows to the one field read here.
      return {
        ...options,
        fields,
        id,
        registeredBy: pluginId,
      } as unknown as R;
    });
  };
}

import type {
  PostCapabilityAction,
  TermTaxonomyCapabilityAction,
} from "../access/contract/capability.js";
import type { RoleDeclaration } from "../access/contract/roles.js";
import type {
  PluginRegistry,
  RegisteredEntryType,
} from "../plugin/registry.js";

/** The actions core's default `contributor` held on every type. */
const ENTRY_ACTIONS: readonly PostCapabilityAction[] = [
  "read",
  "create",
  "edit_own",
];
const TERM_ACTIONS: readonly TermTaxonomyCapabilityAction[] = [
  "read",
  "assign",
];

/**
 * An action a type overrides was the plugin's grant, not core's, so it is
 * left out; a pooled namespace keeps an action any of its types left alone.
 */
function entryGrants(
  plugins: PluginRegistry,
): Record<string, readonly PostCapabilityAction[]> {
  const pools = new Map<string, RegisteredEntryType[]>();
  for (const type of plugins.entryTypes.values()) {
    const pool = pools.get(type.capabilityType) ?? [];
    pools.set(type.capabilityType, pool);
    pool.push(type);
  }
  // Core grants `entry:post:*` itself, whether or not a type pools into it.
  const entry: Record<string, readonly PostCapabilityAction[]> = pools.has(
    "post",
  )
    ? {}
    : { post: ENTRY_ACTIONS };
  for (const [namespace, types] of pools) {
    const key =
      types.find((type) => type.name === namespace)?.name ?? types[0]?.name;
    const actions = ENTRY_ACTIONS.filter((action) =>
      types.some((type) => type.capabilities?.[action] === undefined),
    );
    if (key !== undefined && actions.length > 0) entry[key] = actions;
  }
  return entry;
}

function termGrants(
  plugins: PluginRegistry,
): Record<string, readonly TermTaxonomyCapabilityAction[]> {
  const term: Record<string, readonly TermTaxonomyCapabilityAction[]> = {};
  for (const taxonomy of plugins.termTaxonomies.values()) {
    const actions = TERM_ACTIONS.filter(
      (action) => taxonomy.capabilities?.[action] === undefined,
    );
    if (actions.length > 0) term[taxonomy.name] = actions;
  }
  return term;
}

/**
 * The `contributor` role a site declares to keep the core rights the default
 * `contributor` held, ready to paste into `roles`. A plugin's own grant to
 * contributors is not carried.
 */
export function contributorRoleSnippet(plugins: PluginRegistry): string {
  const role: RoleDeclaration = {
    label: "Contributor",
    can: {
      admin: ["access"],
      user: ["edit_own"],
      entry: entryGrants(plugins),
      term: termGrants(plugins),
    },
  };
  return `contributor: ${JSON.stringify(role, null, 2)}`;
}

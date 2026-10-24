import type { UserRole } from "../../db/schema/users.js";
import type { Label } from "../../i18n/label.js";
import type {
  EntryTypeName,
  TermTaxonomyName,
} from "../../template-registry.js";
import type {
  CoreCapability,
  PostCapabilityAction,
  TermTaxonomyCapabilityAction,
} from "./capability.js";

/** The roles core ships; `admin` always holds every capability. */
export type DefaultRole = UserRole;

type CoreGroupAction<TGroup extends string> = CoreCapability extends infer TName
  ? TName extends `${TGroup}:${infer TAction}`
    ? TAction
    : never
  : never;

type CoreGroup = Exclude<
  CoreCapability extends `${infer TGroup}:${string}` ? TGroup : never,
  "entry" | "term"
>;

/** Keyed by known names that autocomplete, and any other string. */
type KeyedActions<TKey extends string, TAction extends string> = Readonly<
  Partial<Record<TKey | (string & {}), readonly TAction[]>>
>;

/**
 * Typed groups reject a misspelled action. Entry types and taxonomies
 * autocomplete the known names; any other prefix is a plugin's.
 */
export type RoleGrants = {
  readonly entry?: KeyedActions<EntryTypeName, PostCapabilityAction>;
  readonly term?: KeyedActions<TermTaxonomyName, TermTaxonomyCapabilityAction>;
} & {
  readonly [TGroup in CoreGroup]?: readonly CoreGroupAction<TGroup>[];
} & Readonly<
    Record<
      string,
      | readonly string[]
      | Readonly<Record<string, readonly string[] | undefined>>
      | undefined
    >
  >;

export interface RoleDeclaration<TRole extends string = string> {
  readonly label?: Label;
  /** A role whose capabilities this one adds. */
  readonly extends?: TRole;
  readonly can: RoleGrants;
}

/**
 * Keyed by role name. A default's name replaces that default's grants;
 * `admin` can't be declared.
 */
export type SiteRoles<TName extends string = string> = Readonly<
  Record<TName, RoleDeclaration<DefaultRole | TName>>
> & { readonly admin?: never };

/** A name `selfSignup.defaultRole`, `allowedDomains` or an invite accepts. */
export type RoleName<TRoles = SiteRoles> =
  DefaultRole | (keyof NonNullable<TRoles> & string);

/** The role names a site's config declares, defaults included. */
export type RoleNameOf<TConfig> = TConfig extends {
  readonly roles?: infer TRoles;
}
  ? RoleName<TRoles>
  : DefaultRole;

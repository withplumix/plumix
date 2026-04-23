import type { UserRole } from "../db/schema/users.js";
import type { RouteIntent } from "../route/intent.js";

export interface EntryTypeOptions {
  readonly label: string;
  /**
   * Human-readable label variants. `plural` also drives the admin URL slug
   * (`/content/<slugified-plural>`) unless overridden; omit it and the slug
   * falls back to `${name}s`, which is acceptable for English-named types
   * but surfaces an "anglos" for `name: "angle"` etc. — plugins with
   * irregular plurals should set `labels.plural` explicitly.
   */
  readonly labels?: {
    readonly singular?: string;
    readonly plural?: string;
  };
  readonly description?: string;
  readonly supports?: readonly string[];
  readonly taxonomies?: readonly string[];
  readonly isHierarchical?: boolean;
  readonly isPublic?: boolean;
  readonly hasArchive?: boolean | string;
  readonly rewrite?: {
    readonly slug?: string;
    readonly isHierarchical?: boolean;
  };
  readonly capabilityType?: string;
  readonly menuPosition?: number;
  readonly menuIcon?: string;
}

export interface TaxonomyOptions {
  readonly label: string;
  readonly labels?: { readonly singular?: string };
  readonly description?: string;
  readonly isHierarchical?: boolean;
  readonly entryTypes?: readonly string[];
  readonly isPublic?: boolean;
  readonly isInQuickEdit?: boolean;
  readonly hasAdminColumn?: boolean;
  readonly rewrite?: {
    readonly slug?: string;
    readonly isHierarchical?: boolean;
  };
}

export type MetaScalarType = "string" | "number" | "boolean" | "json";

export interface MetaBoxFieldOption {
  readonly value: string;
  readonly label: string;
}

/**
 * A field inside a meta box — the single source of truth for both the
 * admin UI renderer and the server-side storage contract. Declaring a
 * meta box is the only way to register a meta key; there is no separate
 * `registerMeta` step.
 */
export interface MetaBoxField {
  readonly key: string;
  readonly label: string;
  /**
   * Storage type. Drives server-side sanitization on write and
   * coercion on read (`entry.meta` / `term.meta` columns store JSON,
   * but the type informs the expected shape). `json` accepts any
   * JSON-serialisable value.
   */
  readonly type: MetaScalarType;
  /**
   * Drives the admin sidebar's input renderer. Built-in dispatcher
   * handles `text` / `textarea` / `number` / `email` / `url` /
   * `select` / `radio` / `checkbox`. Plugins may use custom values —
   * the renderer falls back to `<input type="text">` for unknown
   * types with a dev-mode console warning.
   */
  readonly inputType: string;
  /**
   * Applied after type coercion, before persistence. Returning a
   * sanitized value replaces the caller's input — ideal for trimming,
   * whitelisting, or normalising shape.
   */
  readonly sanitize?: (value: unknown) => unknown;
  /** Default surfaced in the admin form when the key has no saved value. */
  readonly default?: unknown;
  /** Optional help text rendered under the label on every input type. */
  readonly description?: string;
  /** Renders `required` on the native input; server validation is separate. */
  readonly required?: boolean;
  /** Text-shaped inputs (`text` / `textarea` / `email` / `url` / `number`). */
  readonly placeholder?: string;
  /** Text-shaped inputs — `text` / `textarea` / `email` / `url`. */
  readonly maxLength?: number;
  /** `number` input only. */
  readonly min?: number;
  /** `number` input only. */
  readonly max?: number;
  /** `number` input only; defaults to 1 (integer) when omitted. */
  readonly step?: number;
  /** Required for `select` and `radio`; ignored otherwise. */
  readonly options?: readonly MetaBoxFieldOption[];
}

/**
 * Meta box shown on the entry editor. Rendered alongside the post in
 * `/entries/<type>/<id>`; the `context` hint controls which column the
 * box lands in.
 *
 * `capability` is a UI-only filter: the admin hides boxes the current
 * user lacks the capability for, but the server enforces only the
 * entity-level cap (`<entryType>:edit*`). Do NOT use it to gate
 * secrets — any user who can edit the entry can write any registered
 * meta key via the raw RPC.
 */
export interface EntryMetaBoxOptions {
  readonly label: string;
  readonly description?: string;
  readonly context?: "side" | "normal" | "advanced";
  readonly priority?: "high" | "default" | "low";
  readonly entryTypes: readonly string[];
  readonly capability?: string;
  readonly fields: readonly MetaBoxField[];
}

/**
 * Meta box shown on the taxonomy term edit form. Rendered as one
 * shadcn `<Card>` with its own save button — same card-per-box model
 * as settings groups. Scoped by `taxonomies`.
 *
 * `capability` is a UI-only filter; see `EntryMetaBoxOptions` for the
 * caveat. The server gates term meta writes on `<taxonomy>:edit`.
 */
export interface TermMetaBoxOptions {
  readonly label: string;
  readonly description?: string;
  readonly taxonomies: readonly string[];
  readonly capability?: string;
  readonly fields: readonly MetaBoxField[];
}

/**
 * Meta box shown on the user edit form. Rendered as stacked shadcn
 * `<Card>`s with independent save buttons — same card-per-box model as
 * term boxes and settings groups. User meta is a flat keyspace (no
 * scope analogue to entry types or taxonomies), so every registered
 * box targets every user; use `capability` to gate which boxes the
 * viewer sees.
 *
 * `capability` is a UI-only filter; see `EntryMetaBoxOptions` for the
 * caveat. The server gates user meta writes on `user:edit` /
 * `user:edit_own` (same check as the rest of `user.update`).
 *
 * `MetaBoxField.sanitize` runs server-side only — the manifest wire
 * contract strips callbacks before shipping to the admin bundle.
 */
export interface UserMetaBoxOptions {
  readonly label: string;
  readonly description?: string;
  readonly capability?: string;
  readonly fields: readonly MetaBoxField[];
}

/**
 * Narrow discriminator for settings-form fields. Mirrors the subset of
 * `MetaBoxField.inputType` values that the settings admin's field
 * dispatcher renders today — `text` (single-line) and `textarea`
 * (multi-line). Extending this is cheap: add a new literal, then teach
 * the admin's `SettingsField` dispatcher to render it. Keeping the
 * union narrow (vs free-form string like meta boxes) trades plugin
 * extensibility for an exhaustive type-check in the dispatcher.
 */
export type SettingsFieldType = "text" | "textarea";

export interface SettingsField {
  readonly name: string;
  readonly label: string;
  readonly type: SettingsFieldType;
  /**
   * Initial value rendered when nothing has been saved yet. Admin forms
   * fall back to this on first render if `settings.get({ group })`
   * returns no entry for the field.
   */
  readonly default?: string;
  readonly description?: string;
  readonly placeholder?: string;
  /** Text-shaped inputs. Enforced on the client; server re-validates. */
  readonly maxLength?: number;
}

/**
 * A self-contained group of fields — storage unit and visual unit.
 * Plugins register groups with `ctx.registerSettingsGroup(name, {...})`;
 * they land as one shadcn `<Card>` in the admin with `label` as the
 * title, `description` as the subtitle, and their own save button in
 * the card footer. Storage key is `(group.name, field.name)`.
 */
export interface SettingsGroupOptions {
  readonly label: string;
  readonly description?: string;
  readonly fields: readonly SettingsField[];
}

/**
 * A UI-level composition of groups rendered at `/settings/<page>` in the
 * admin. Pages are not stored — they're pure registration metadata. A
 * page lists the groups it wants to surface by name (each group can be
 * referenced from multiple pages if useful).
 */
export interface SettingsPageOptions {
  readonly label: string;
  readonly description?: string;
  readonly groups: readonly string[];
  /**
   * Admin menu ordering. Unspecified positions sort last (in
   * registration order). Mirrors `EntryTypeOptions.menuPosition` so
   * sidebar composition stays predictable across plugins.
   */
  readonly menuPosition?: number;
}

export interface RegisteredEntryType extends EntryTypeOptions {
  readonly name: string;
  readonly registeredBy: string | null;
}

export interface RegisteredTaxonomy extends TaxonomyOptions {
  readonly name: string;
  readonly registeredBy: string | null;
}

export interface RegisteredEntryMetaBox extends EntryMetaBoxOptions {
  readonly id: string;
  readonly registeredBy: string | null;
}

export interface RegisteredTermMetaBox extends TermMetaBoxOptions {
  readonly id: string;
  readonly registeredBy: string | null;
}

export interface RegisteredUserMetaBox extends UserMetaBoxOptions {
  readonly id: string;
  readonly registeredBy: string | null;
}

export interface RegisteredSettingsGroup extends SettingsGroupOptions {
  readonly name: string;
  readonly registeredBy: string | null;
}

export interface RegisteredSettingsPage extends SettingsPageOptions {
  readonly name: string;
  readonly registeredBy: string | null;
}

export interface RegisteredCapability {
  readonly name: string;
  readonly minRole: UserRole;
  readonly registeredBy: string | null;
}

export interface RegisteredRewriteRule {
  readonly pattern: string;
  readonly intent: RouteIntent;
  readonly priority: number;
  readonly registeredBy: string | null;
}

export interface PluginRegistry {
  readonly entryTypes: ReadonlyMap<string, RegisteredEntryType>;
  readonly taxonomies: ReadonlyMap<string, RegisteredTaxonomy>;
  readonly entryMetaBoxes: ReadonlyMap<string, RegisteredEntryMetaBox>;
  readonly termMetaBoxes: ReadonlyMap<string, RegisteredTermMetaBox>;
  readonly userMetaBoxes: ReadonlyMap<string, RegisteredUserMetaBox>;
  readonly capabilities: ReadonlyMap<string, RegisteredCapability>;
  readonly settingsGroups: ReadonlyMap<string, RegisteredSettingsGroup>;
  readonly settingsPages: ReadonlyMap<string, RegisteredSettingsPage>;
  readonly rewriteRules: readonly RegisteredRewriteRule[];
}

export interface MutablePluginRegistry extends PluginRegistry {
  readonly entryTypes: Map<string, RegisteredEntryType>;
  readonly taxonomies: Map<string, RegisteredTaxonomy>;
  readonly entryMetaBoxes: Map<string, RegisteredEntryMetaBox>;
  readonly termMetaBoxes: Map<string, RegisteredTermMetaBox>;
  readonly userMetaBoxes: Map<string, RegisteredUserMetaBox>;
  readonly capabilities: Map<string, RegisteredCapability>;
  readonly settingsGroups: Map<string, RegisteredSettingsGroup>;
  readonly settingsPages: Map<string, RegisteredSettingsPage>;
  readonly rewriteRules: RegisteredRewriteRule[];
}

export function createPluginRegistry(): MutablePluginRegistry {
  return {
    entryTypes: new Map(),
    taxonomies: new Map(),
    entryMetaBoxes: new Map(),
    termMetaBoxes: new Map(),
    userMetaBoxes: new Map(),
    capabilities: new Map(),
    settingsGroups: new Map(),
    settingsPages: new Map(),
    rewriteRules: [],
  };
}

/**
 * Look up the `MetaBoxField` declaration for a meta key within the
 * entry meta surface, scoped to a given entry type. Returns the first
 * matching field across all registered entry meta boxes — key
 * uniqueness per (entryType, key) is enforced at registration time,
 * so "first match" is the only match.
 */
export function findEntryMetaField(
  registry: PluginRegistry,
  entryType: string,
  key: string,
): MetaBoxField | undefined {
  for (const box of registry.entryMetaBoxes.values()) {
    if (!box.entryTypes.includes(entryType)) continue;
    const field = box.fields.find((f) => f.key === key);
    if (field) return field;
  }
  return undefined;
}

/**
 * Like `findEntryMetaField`, but for term meta. Scoped by taxonomy.
 */
export function findTermMetaField(
  registry: PluginRegistry,
  taxonomy: string,
  key: string,
): MetaBoxField | undefined {
  for (const box of registry.termMetaBoxes.values()) {
    if (!box.taxonomies.includes(taxonomy)) continue;
    const field = box.fields.find((f) => f.key === key);
    if (field) return field;
  }
  return undefined;
}

/**
 * Like `findEntryMetaField`, but for user meta. Users have a flat
 * keyspace (no entry-type / taxonomy analogue), so no scope argument —
 * key uniqueness across all user meta boxes is enforced at manifest-
 * build time.
 */
export function findUserMetaField(
  registry: PluginRegistry,
  key: string,
): MetaBoxField | undefined {
  for (const box of registry.userMetaBoxes.values()) {
    const field = box.fields.find((f) => f.key === key);
    if (field) return field;
  }
  return undefined;
}

export class DuplicateRegistrationError extends Error {
  constructor(kind: string, name: string) {
    super(`${kind} "${name}" is already registered`);
    this.name = "DuplicateRegistrationError";
  }
}

/**
 * Shape serialised into the admin's `<script id="plumix-manifest">` payload.
 * Intentionally a strict subset of `RegisteredEntryType`: drops
 * `registeredBy` (plugin attribution is server-only debug metadata) and
 * `rewrite` (URL mapping is evaluated server-side). Add fields only when the
 * admin UI needs them.
 *
 * `adminSlug` is derived at build time (see `buildManifest`) and is what the
 * admin router uses for `/entries/$slug`. Keeping it in the manifest rather
 * than re-deriving client-side lets the collision check run once on the
 * server and ships the final routing key as authoritative.
 */
export interface EntryTypeManifestEntry {
  readonly name: string;
  readonly adminSlug: string;
  readonly label: string;
  readonly labels?: {
    readonly singular?: string;
    readonly plural?: string;
  };
  readonly description?: string;
  readonly supports?: readonly string[];
  readonly taxonomies?: readonly string[];
  readonly isHierarchical?: boolean;
  readonly isPublic?: boolean;
  readonly hasArchive?: boolean | string;
  readonly capabilityType?: string;
  readonly menuPosition?: number;
  readonly menuIcon?: string;
}

/**
 * Client-safe field descriptor inside a meta box. Mirrors `MetaBoxField`
 * minus the server-only `sanitize` callback and `default` value (the
 * admin receives the default server-side and injects it into the form).
 */
export interface MetaBoxFieldManifestEntry {
  readonly key: string;
  readonly label: string;
  readonly type: MetaScalarType;
  readonly inputType: string;
  readonly description?: string;
  readonly required?: boolean;
  readonly placeholder?: string;
  readonly maxLength?: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly options?: readonly MetaBoxFieldOption[];
  readonly default?: unknown;
}

/**
 * Shape serialised for entry meta boxes (post editor sidebar). Strict
 * allowlist projection of `RegisteredEntryMetaBox`; drops
 * `registeredBy` (server-only debug metadata).
 */
export interface EntryMetaBoxManifestEntry {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly context?: "side" | "normal" | "advanced";
  readonly priority?: "high" | "default" | "low";
  readonly entryTypes: readonly string[];
  readonly capability?: string;
  readonly fields: readonly MetaBoxFieldManifestEntry[];
}

/**
 * Shape serialised for term meta boxes (taxonomy edit form). Same
 * field-level shape as `EntryMetaBoxManifestEntry`; `context` /
 * `priority` don't apply because term forms render stacked cards.
 */
export interface TermMetaBoxManifestEntry {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly taxonomies: readonly string[];
  readonly capability?: string;
  readonly fields: readonly MetaBoxFieldManifestEntry[];
}

/**
 * Shape serialised for user meta boxes (user edit form). No scope
 * property — user meta boxes target the single user-entity surface.
 */
export interface UserMetaBoxManifestEntry {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly capability?: string;
  readonly fields: readonly MetaBoxFieldManifestEntry[];
}

/**
 * Shape serialised for taxonomies in the manifest. Strict allowlist
 * projection of `RegisteredTaxonomy` — drops `registeredBy` (server-only
 * debug metadata) and server-only operational flags (`isInQuickEdit`,
 * `hasAdminColumn`, `rewrite`) that don't affect the admin UI today.
 * `entryTypes` is kept so future admin surfaces (term-picker on post
 * editor) can filter by post type without a second round-trip.
 */
export interface TaxonomyManifestEntry {
  readonly name: string;
  readonly label: string;
  readonly labels?: { readonly singular?: string };
  readonly description?: string;
  readonly isHierarchical?: boolean;
  readonly entryTypes?: readonly string[];
}

/**
 * Client-safe projection of a settings field. Mirrors `SettingsField`
 * today — kept separate so the manifest boundary can diverge (e.g.,
 * strip server-only validators / sanitisers) without rippling through
 * plugin registration code.
 */
export interface SettingsFieldManifestEntry {
  readonly name: string;
  readonly label: string;
  readonly type: SettingsFieldType;
  readonly default?: string;
  readonly description?: string;
  readonly placeholder?: string;
  readonly maxLength?: number;
}

/**
 * Shape serialised for settings groups in the manifest. Strict allowlist
 * projection of `RegisteredSettingsGroup` — drops `registeredBy`
 * (server-only debug metadata).
 */
export interface SettingsGroupManifestEntry {
  readonly name: string;
  readonly label: string;
  readonly description?: string;
  readonly fields: readonly SettingsFieldManifestEntry[];
}

/**
 * Shape serialised for settings pages in the manifest. Pages are pure
 * admin-UI composition: `groups` names registered groups in render
 * order, one shadcn `<Card>` per group in the admin route.
 */
export interface SettingsPageManifestEntry {
  readonly name: string;
  readonly label: string;
  readonly description?: string;
  readonly groups: readonly string[];
  readonly menuPosition?: number;
}

export interface PlumixManifest {
  readonly entryTypes: readonly EntryTypeManifestEntry[];
  readonly taxonomies: readonly TaxonomyManifestEntry[];
  readonly entryMetaBoxes: readonly EntryMetaBoxManifestEntry[];
  readonly termMetaBoxes: readonly TermMetaBoxManifestEntry[];
  readonly userMetaBoxes: readonly UserMetaBoxManifestEntry[];
  readonly settingsGroups: readonly SettingsGroupManifestEntry[];
  readonly settingsPages: readonly SettingsPageManifestEntry[];
}

/** Script tag id that carries the JSON-encoded manifest in the admin HTML. */
export const MANIFEST_SCRIPT_ID = "plumix-manifest";

export function emptyManifest(): PlumixManifest {
  return {
    entryTypes: [],
    taxonomies: [],
    entryMetaBoxes: [],
    termMetaBoxes: [],
    userMetaBoxes: [],
    settingsGroups: [],
    settingsPages: [],
  };
}

/**
 * Project a registry snapshot into its manifest form — the subset that ships
 * to the admin bundle. Entry types are ordered by `menuPosition` ascending,
 * with unspecified positions last. Among entries with the same (or no)
 * `menuPosition` the registration order wins — `Array.prototype.sort` is
 * stable per ES2019, and the registry's `Map` preserves insertion order.
 *
 * Throws `DuplicateAdminSlugError` if two post types resolve to the same
 * admin slug — the admin router can't disambiguate `/entries/$slug` in that
 * case, and catching it at build time is cheaper than a 404 at runtime.
 */
export function buildManifest(registry: PluginRegistry): PlumixManifest {
  const entries = Array.from(registry.entryTypes.values()).map(
    toEntryTypeManifest,
  );
  entries.sort((a, b) => {
    const ap = a.menuPosition ?? Number.POSITIVE_INFINITY;
    const bp = b.menuPosition ?? Number.POSITIVE_INFINITY;
    return ap - bp;
  });
  assertUniqueAdminSlugs(entries);
  const taxonomies = Array.from(registry.taxonomies.values()).map(
    toTaxonomyEntry,
  );
  const entryMetaBoxes = Array.from(registry.entryMetaBoxes.values()).map(
    toEntryMetaBoxEntry,
  );
  const termMetaBoxes = Array.from(registry.termMetaBoxes.values()).map(
    toTermMetaBoxEntry,
  );
  const userMetaBoxes = Array.from(registry.userMetaBoxes.values()).map(
    toUserMetaBoxEntry,
  );
  assertMetaBoxScopesExist(
    entryMetaBoxes,
    (box) => box.entryTypes,
    new Set(entries.map((e) => e.name)),
    "entry meta box",
    "entry type",
  );
  assertMetaBoxScopesExist(
    termMetaBoxes,
    (box) => box.taxonomies,
    new Set(taxonomies.map((t) => t.name)),
    "term meta box",
    "taxonomy",
  );
  assertUniqueFieldKeysPerScope(
    entryMetaBoxes,
    (box) => box.entryTypes,
    "entry",
  );
  assertUniqueFieldKeysPerScope(termMetaBoxes, (box) => box.taxonomies, "term");
  // User meta is a flat keyspace — one synthetic "user" scope keeps
  // the shared helper honest without inventing a second code path.
  assertUniqueFieldKeysPerScope(userMetaBoxes, getUserScope, "user");
  const settingsGroups = Array.from(registry.settingsGroups.values()).map(
    toSettingsGroupEntry,
  );
  const settingsPages = Array.from(registry.settingsPages.values())
    .map(toSettingsPageEntry)
    .sort((a, b) => {
      const ap = a.menuPosition ?? Number.POSITIVE_INFINITY;
      const bp = b.menuPosition ?? Number.POSITIVE_INFINITY;
      return ap - bp;
    });
  assertSettingsPageGroupsExist(settingsPages, registry.settingsGroups);
  return {
    entryTypes: entries,
    taxonomies,
    entryMetaBoxes,
    termMetaBoxes,
    userMetaBoxes,
    settingsGroups,
    settingsPages,
  };
}

// Synthetic flat-keyspace scope for user meta. Hoisted so the
// `assertUniqueFieldKeysPerScope` callback doesn't re-allocate per
// buildManifest call.
const USER_SCOPE = ["user"] as const;
const getUserScope = (): readonly string[] => USER_SCOPE;

/**
 * Two meta boxes on the same `(scope, field.key)` pair would silently
 * write to the same storage key — a plugin-author footgun. Fail loudly
 * at manifest-build time. `scope` is the entry type (for entry boxes)
 * or taxonomy (for term boxes); user boxes collapse to one synthetic
 * scope because the user keyspace is flat.
 */
function assertUniqueFieldKeysPerScope<
  TBox extends {
    readonly id: string;
    readonly fields: readonly MetaBoxFieldManifestEntry[];
  },
>(
  boxes: readonly TBox[],
  getScopes: (box: TBox) => readonly string[],
  kind: "entry" | "term" | "user",
): void {
  const seen = new Map<string, string>();
  for (const box of boxes) {
    for (const scope of getScopes(box)) {
      for (const field of box.fields) {
        const scopedKey = `${scope}:${field.key}`;
        const existing = seen.get(scopedKey);
        if (existing !== undefined && existing !== box.id) {
          throw new Error(
            `Meta field "${field.key}" is declared by ${kind} meta ` +
              `boxes "${existing}" and "${box.id}" on the same scope ` +
              `"${scope}". Each key may appear in at most one box ` +
              `per scope.`,
          );
        }
        seen.set(scopedKey, box.id);
      }
    }
  }
}

// A meta box referencing an unregistered scope ("catagory" typo, a
// taxonomy removed behind the plugin's back, etc.) is dead code — the
// box never renders and never writes. Fail at manifest build so the
// plugin author sees it on boot, not at first admin click. Matches the
// settings-page→group reference check.
function assertMetaBoxScopesExist<TBox extends { readonly id: string }>(
  boxes: readonly TBox[],
  getScopes: (box: TBox) => readonly string[],
  known: ReadonlySet<string>,
  boxKind: string,
  scopeKind: string,
): void {
  for (const box of boxes) {
    for (const scope of getScopes(box)) {
      if (!known.has(scope)) {
        throw new Error(
          `${boxKind} "${box.id}" references ${scopeKind} "${scope}" ` +
            `which hasn't been registered.`,
        );
      }
    }
  }
}

// Surfacing a clear error at manifest-build time beats a runtime
// "unknown group" in the admin route. Pages reference groups by name;
// if a group name doesn't resolve, the plugin author has a typo or
// order-of-registration problem.
function assertSettingsPageGroupsExist(
  pages: readonly SettingsPageManifestEntry[],
  groups: ReadonlyMap<string, RegisteredSettingsGroup>,
): void {
  for (const page of pages) {
    for (const groupName of page.groups) {
      if (!groups.has(groupName)) {
        throw new Error(
          `Settings page "${page.name}" references group "${groupName}" ` +
            `which hasn't been registered. Call ` +
            `ctx.registerSettingsGroup("${groupName}", {...}) before the page.`,
        );
      }
    }
  }
}

function assertUniqueAdminSlugs(
  entries: readonly EntryTypeManifestEntry[],
): void {
  const seen = new Map<string, string>();
  for (const entry of entries) {
    const existing = seen.get(entry.adminSlug);
    if (existing !== undefined) {
      throw new DuplicateAdminSlugError(existing, entry.name, entry.adminSlug);
    }
    seen.set(entry.adminSlug, entry.name);
  }
}

export class DuplicateAdminSlugError extends Error {
  constructor(firstPostType: string, secondPostType: string, slug: string) {
    super(
      `Entry types "${firstPostType}" and "${secondPostType}" both resolve ` +
        `to the admin slug "${slug}". Set \`labels.plural\` on one of them ` +
        `to disambiguate.`,
    );
    this.name = "DuplicateAdminSlugError";
  }
}

/**
 * Derive the URL-safe admin slug for a post type. Prefers `plural` when
 * set (allows "fish" → `fish`, "children" → `children`, etc.), falls back
 * to `${name}s` which is English-biased but matches the common case.
 * Non-alphanumerics collapse to single dashes; leading/trailing dashes
 * are trimmed. Empty results throw — an empty slug would shadow
 * `/content/` itself in TanStack Router.
 */
export function deriveAdminSlug(name: string, plural?: string): string {
  const source = plural ?? `${name}s`;
  const slug = slugify(source);
  if (slug.length === 0) {
    const from = plural === undefined ? "its name" : `plural="${plural}"`;
    throw new Error(
      `Cannot derive an admin slug for post type "${name}" from ${from} — result was empty.`,
    );
  }
  return slug;
}

// Hand-rolled single-pass slugifier rather than chained `.replace()` calls.
// The regex form (`/[^a-z0-9]+/g` plus a trim) trips CodeQL's polynomial-
// regex detector on library-exposed inputs; this loop is provably O(n),
// regex-free, and produces the same output: lowercase ASCII alphanumerics
// separated by single dashes, no leading/trailing dashes.
function slugify(input: string): string {
  const lower = input.toLowerCase();
  let result = "";
  let pendingDash = false;
  for (let i = 0; i < lower.length; i++) {
    const code = lower.charCodeAt(i);
    const isAlphaNum =
      (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
    if (isAlphaNum) {
      if (pendingDash && result.length > 0) result += "-";
      result += lower[i];
      pendingDash = false;
    } else {
      pendingDash = true;
    }
  }
  return result;
}

// Explicit allowlist — only the destructured keys ship to the browser.
// Adding a field to `EntryTypeOptions` / `RegisteredEntryType` does NOT
// automatically leak it; it must be added here AND to `EntryTypeManifestEntry`
// to surface in the admin. `registeredBy` and `rewrite` are intentionally
// excluded: the first is debug metadata, the second is server-side URL
// mapping.
function toEntryTypeManifest(pt: RegisteredEntryType): EntryTypeManifestEntry {
  const {
    name,
    label,
    labels,
    description,
    supports,
    taxonomies,
    isHierarchical,
    isPublic,
    hasArchive,
    capabilityType,
    menuPosition,
    menuIcon,
  } = pt;
  return {
    name,
    adminSlug: deriveAdminSlug(name, labels?.plural),
    label,
    labels,
    description,
    supports,
    taxonomies,
    isHierarchical,
    isPublic,
    hasArchive,
    capabilityType,
    menuPosition,
    menuIcon,
  };
}

// Allowlist for taxonomy entries — same rationale as `toEntryTypeManifest`.
// `registeredBy` excluded; `isPublic` / `isInQuickEdit` / `hasAdminColumn`
// / `rewrite` are server-/public-site-only and don't affect the admin
// surface, so they're intentionally dropped from the wire contract until
// a concrete admin need arises.
function toTaxonomyEntry(tax: RegisteredTaxonomy): TaxonomyManifestEntry {
  const { name, label, labels, description, isHierarchical, entryTypes } = tax;
  return {
    name,
    label,
    labels,
    description,
    isHierarchical,
    entryTypes,
  };
}

// Allowlist for entry meta box entries — same rationale as
// `toEntryTypeManifest`. `registeredBy` is intentionally excluded
// (server-only debug metadata). `sanitize` on each field is stripped
// via `toMetaBoxFieldEntry` — it's a server-side callback.
function toEntryMetaBoxEntry(
  box: RegisteredEntryMetaBox,
): EntryMetaBoxManifestEntry {
  const {
    id,
    label,
    description,
    context,
    priority,
    entryTypes,
    capability,
    fields,
  } = box;
  return {
    id,
    label,
    description,
    context,
    priority,
    entryTypes,
    capability,
    fields: fields.map(toMetaBoxFieldEntry),
  };
}

// Term meta boxes are always stacked top-to-bottom on the taxonomy
// edit form — no `context` / `priority` hints apply.
function toTermMetaBoxEntry(
  box: RegisteredTermMetaBox,
): TermMetaBoxManifestEntry {
  const { id, label, description, taxonomies, capability, fields } = box;
  return {
    id,
    label,
    description,
    taxonomies,
    capability,
    fields: fields.map(toMetaBoxFieldEntry),
  };
}

// User meta boxes are stacked like term boxes — no scope / context.
function toUserMetaBoxEntry(
  box: RegisteredUserMetaBox,
): UserMetaBoxManifestEntry {
  const { id, label, description, capability, fields } = box;
  return {
    id,
    label,
    description,
    capability,
    fields: fields.map(toMetaBoxFieldEntry),
  };
}

// Allowlist for settings group entries — same rationale as the other
// `to*Entry` projections. `registeredBy` is server-only debug metadata.
function toSettingsGroupEntry(
  group: RegisteredSettingsGroup,
): SettingsGroupManifestEntry {
  const { name, label, description, fields } = group;
  return {
    name,
    label,
    description,
    fields: fields.map(toSettingsFieldEntry),
  };
}

function toSettingsPageEntry(
  page: RegisteredSettingsPage,
): SettingsPageManifestEntry {
  const { name, label, description, groups, menuPosition } = page;
  return { name, label, description, groups, menuPosition };
}

function toSettingsFieldEntry(
  field: SettingsField,
): SettingsFieldManifestEntry {
  const {
    name,
    label,
    type,
    default: defaultValue,
    description,
    placeholder,
    maxLength,
  } = field;
  return {
    name,
    label,
    type,
    default: defaultValue,
    description,
    placeholder,
    maxLength,
  };
}

function toMetaBoxFieldEntry(field: MetaBoxField): MetaBoxFieldManifestEntry {
  const {
    key,
    label,
    type,
    inputType,
    description,
    required,
    placeholder,
    maxLength,
    min,
    max,
    step,
    options,
    default: defaultValue,
  } = field;
  return {
    key,
    label,
    type,
    inputType,
    description,
    required,
    placeholder,
    maxLength,
    min,
    max,
    step,
    options,
    default: defaultValue,
  };
}

/**
 * Serialise a manifest into the `<script>` markup injected into the admin
 * `index.html`. The payload lives inside a `type="application/json"` block,
 * so it isn't executed — but a stray `</script>` sequence would still end
 * the tag and leak the remainder into the document. Escape the slash to
 * neutralise that, which is the standard JSON-in-HTML-script hardening.
 */
export function serializeManifestScript(manifest: PlumixManifest): string {
  const safe = JSON.stringify(manifest).replaceAll("</", "<\\/");
  return `<script id="${MANIFEST_SCRIPT_ID}" type="application/json">${safe}</script>`;
}

// Case-insensitive match on the script tag — Vite's bundler today emits
// lowercase tags and we control the placeholder, but minifiers upstream
// could normalise to uppercase and we'd rather match than silently fall
// through to the fail-fast branch.
const MANIFEST_SCRIPT_RE = new RegExp(
  `<script id="${MANIFEST_SCRIPT_ID}"[^>]*>[\\s\\S]*?</script>`,
  "i",
);

/**
 * Replace the `<script id="plumix-manifest">` placeholder in the admin's
 * `index.html` with a freshly serialised manifest. Throws if the placeholder
 * is missing — that's an indicator that the admin bundle is out of date
 * (was built without the placeholder), and silently appending would mask
 * the staleness.
 */
export function injectManifestIntoHtml(
  html: string,
  manifest: PlumixManifest,
): string {
  if (!MANIFEST_SCRIPT_RE.test(html)) {
    throw new Error(
      `Admin index.html is missing the <script id="${MANIFEST_SCRIPT_ID}"> ` +
        `placeholder. Rebuild @plumix/admin.`,
    );
  }
  return html.replace(MANIFEST_SCRIPT_RE, serializeManifestScript(manifest));
}

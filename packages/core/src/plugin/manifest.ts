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
  readonly priority?: number;
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
 * Column span for a field within its meta box's 12-column grid. A plain
 * number applies from the smallest breakpoint up. The object form is
 * mobile-first: `base` is the default, `sm` / `md` / `lg` override upward.
 * Breakpoints key off the card's own width (Tailwind container queries,
 * `@sm` / `@md` / `@lg`) so the same `span` renders consistently whether
 * the box lands in a full-width route or a narrow sidebar. Values outside
 * 1..12 are clamped at render time. Omitted span means full width (12).
 */
export type MetaBoxFieldSpan =
  | number
  | {
      readonly base?: number;
      readonly sm?: number;
      readonly md?: number;
      readonly lg?: number;
    };

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
  /**
   * Column span within the meta box's 12-column grid. Defaults to full
   * width. See `MetaBoxFieldSpan` for the responsive object form.
   */
  readonly span?: MetaBoxFieldSpan;
}

/**
 * Shared base for every "card of fields" registration surface — entry
 * meta boxes, term meta boxes, user meta boxes, and settings groups.
 * Each concrete surface extends this with its scope specifier (if any)
 * and any surface-specific layout hints (`location` on entry boxes).
 *
 * Semantics shared across every extender:
 * - `priority` orders cards within their region; lower first,
 *   unspecified sorts last, ties break by `id` / `name` alphabetical.
 * - `capability` is a UI-only filter — the admin hides cards the
 *   viewer lacks the capability for. The server enforces only the
 *   entity-level write gate (`<entryType>:edit*`, `<taxonomy>:edit`,
 *   `user:edit`, `settings:manage`). Do NOT use `capability` for
 *   secrets; any user with the entity write gate can write any
 *   registered field via the raw RPC.
 * - `fields` carry `MetaBoxField.sanitize` which runs server-side only
 *   — the manifest wire contract strips callbacks before shipping.
 */
export interface MetaBoxBaseOptions {
  readonly label: string;
  readonly description?: string;
  readonly priority?: number;
  readonly capability?: string;
  readonly fields: readonly MetaBoxField[];
}

/**
 * Meta box shown on the entry editor. `location` chooses between the
 * right rail (`"sidebar"`) and below the main editor (`"bottom"`,
 * default). Scoped by `entryTypes`.
 */
export interface EntryMetaBoxOptions extends MetaBoxBaseOptions {
  readonly location?: "bottom" | "sidebar";
  readonly entryTypes: readonly string[];
}

/** Meta box shown on the taxonomy term edit form. Scoped by `taxonomies`. */
export interface TermMetaBoxOptions extends MetaBoxBaseOptions {
  readonly taxonomies: readonly string[];
}

/**
 * Meta box shown on the user edit form. User meta is a flat keyspace
 * (no scope analogue to entry types or taxonomies), so the base shape
 * is everything an author needs.
 */
export type UserMetaBoxOptions = MetaBoxBaseOptions;

/**
 * A self-contained group of fields on a settings page — storage unit
 * AND visual unit. Each group gets its own Save button (independent
 * storage, unlike entity meta which rides the entity's single Save).
 * Surfaced via `registerSettingsPage.groups: string[]`.
 */
export type SettingsGroupOptions = MetaBoxBaseOptions;

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
   * registration order). Mirrors `EntryTypeOptions.priority` so
   * sidebar composition stays predictable across plugins.
   */
  readonly priority?: number;
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
  readonly priority?: number;
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
  readonly span?: MetaBoxFieldSpan;
}

/**
 * Shared base for every "card of fields" serialised entry. Each
 * concrete projection extends with its identifier + any surface-
 * specific layout + scope fields.
 */
export interface MetaBoxBaseManifestEntry {
  readonly label: string;
  readonly description?: string;
  readonly priority?: number;
  readonly capability?: string;
  readonly fields: readonly MetaBoxFieldManifestEntry[];
}

export interface EntryMetaBoxManifestEntry extends MetaBoxBaseManifestEntry {
  readonly id: string;
  readonly location?: "bottom" | "sidebar";
  readonly entryTypes: readonly string[];
}

export interface TermMetaBoxManifestEntry extends MetaBoxBaseManifestEntry {
  readonly id: string;
  readonly taxonomies: readonly string[];
}

export interface UserMetaBoxManifestEntry extends MetaBoxBaseManifestEntry {
  readonly id: string;
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
 * Shape serialised for settings groups in the manifest. Same shared
 * shape as every other meta surface; the storage key `name` replaces
 * the meta-box `id`. Fields use the same `MetaBoxFieldManifestEntry`
 * type — one field contract for plugin authors.
 */
export interface SettingsGroupManifestEntry extends MetaBoxBaseManifestEntry {
  readonly name: string;
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
  readonly priority?: number;
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
 * to the admin bundle. Every surface with a `priority?: number` field —
 * entry types, entry/term/user meta boxes, settings pages, settings groups —
 * is sorted by `priority` ascending; ties break by `name` / `id`
 * alphabetical so the shipped order is deterministic regardless of
 * plugin install order.
 *
 * Throws `DuplicateAdminSlugError` if two post types resolve to the same
 * admin slug — the admin router can't disambiguate `/entries/$slug` in that
 * case, and catching it at build time is cheaper than a 404 at runtime.
 */
export function buildManifest(registry: PluginRegistry): PlumixManifest {
  const entries = Array.from(registry.entryTypes.values())
    .map(toEntryTypeManifest)
    .sort(byPriorityThen((e) => e.name));
  assertUniqueAdminSlugs(entries);
  const taxonomies = Array.from(registry.taxonomies.values()).map(
    toTaxonomyEntry,
  );
  const entryMetaBoxes = Array.from(registry.entryMetaBoxes.values())
    .map(toEntryMetaBoxEntry)
    .sort(byPriorityThen((b) => b.id));
  const termMetaBoxes = Array.from(registry.termMetaBoxes.values())
    .map(toTermMetaBoxEntry)
    .sort(byPriorityThen((b) => b.id));
  const userMetaBoxes = Array.from(registry.userMetaBoxes.values())
    .map(toUserMetaBoxEntry)
    .sort(byPriorityThen((b) => b.id));
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
  const settingsGroups = Array.from(registry.settingsGroups.values())
    .map(toSettingsGroupEntry)
    .sort(byPriorityThen((g) => g.name));
  const settingsPages = Array.from(registry.settingsPages.values())
    .map(toSettingsPageEntry)
    .sort(byPriorityThen((p) => p.name));
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

/**
 * Shared comparator: `priority` ascending (unspecified sorts last),
 * ties broken by a caller-supplied stable key (id / name) in
 * alphabetical order. Used by `buildManifest` server-side AND the
 * admin's in-memory filter helpers so the shipped manifest and the
 * admin filter paths agree on order regardless of registration
 * sequence.
 */
export function byPriorityThen<T extends { readonly priority?: number }>(
  getKey: (item: T) => string,
): (a: T, b: T) => number {
  return (a, b) => {
    const ap = a.priority ?? Number.POSITIVE_INFINITY;
    const bp = b.priority ?? Number.POSITIVE_INFINITY;
    if (ap !== bp) return ap - bp;
    return getKey(a).localeCompare(getKey(b));
  };
}

/**
 * Seed per-field values from a server meta bag, falling back to each
 * field's registered `default`. Shared by every admin form that owns
 * meta state (entry editor, term edit route, user edit route, settings
 * group card) — one shape, one behaviour.
 */
export function seedFromMetaBoxes(
  boxes: readonly {
    readonly fields: readonly {
      readonly key: string;
      readonly default?: unknown;
    }[];
  }[],
  stored: Readonly<Record<string, unknown>> | null | undefined,
): Record<string, unknown> {
  const bag = stored ?? {};
  const seed: Record<string, unknown> = {};
  for (const box of boxes) {
    for (const field of box.fields) {
      seed[field.key] = bag[field.key] ?? field.default;
    }
  }
  return seed;
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
    priority,
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
    priority,
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
    location,
    priority,
    entryTypes,
    capability,
    fields,
  } = box;
  return {
    id,
    label,
    description,
    location,
    priority,
    entryTypes,
    capability,
    fields: fields.map(toMetaBoxFieldEntry),
  };
}

// Term meta boxes are always stacked top-to-bottom on the taxonomy
// edit form — no `location` hint applies.
function toTermMetaBoxEntry(
  box: RegisteredTermMetaBox,
): TermMetaBoxManifestEntry {
  const { id, label, description, priority, taxonomies, capability, fields } =
    box;
  return {
    id,
    label,
    description,
    priority,
    taxonomies,
    capability,
    fields: fields.map(toMetaBoxFieldEntry),
  };
}

// User meta boxes are stacked like term boxes — no scope / location.
function toUserMetaBoxEntry(
  box: RegisteredUserMetaBox,
): UserMetaBoxManifestEntry {
  const { id, label, description, priority, capability, fields } = box;
  return {
    id,
    label,
    description,
    priority,
    capability,
    fields: fields.map(toMetaBoxFieldEntry),
  };
}

// Allowlist for settings group entries — same rationale as the other
// `to*Entry` projections. `registeredBy` is server-only debug metadata.
// Fields ship through `toMetaBoxFieldEntry` — same projection as every
// other meta surface.
function toSettingsGroupEntry(
  group: RegisteredSettingsGroup,
): SettingsGroupManifestEntry {
  const { name, label, description, priority, capability, fields } = group;
  return {
    name,
    label,
    description,
    priority,
    capability,
    fields: fields.map(toMetaBoxFieldEntry),
  };
}

function toSettingsPageEntry(
  page: RegisteredSettingsPage,
): SettingsPageManifestEntry {
  const { name, label, description, groups, priority } = page;
  return { name, label, description, groups, priority };
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
    span,
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
    span,
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

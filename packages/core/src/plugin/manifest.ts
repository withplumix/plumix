import type { UserRole } from "../db/schema/users.js";

export interface PostTypeOptions {
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
  readonly postTypes?: readonly string[];
  readonly isPublic?: boolean;
  readonly isInQuickEdit?: boolean;
  readonly hasAdminColumn?: boolean;
  readonly rewrite?: {
    readonly slug?: string;
    readonly isHierarchical?: boolean;
  };
}

export type MetaScalarType = "string" | "number" | "boolean" | "json";

export interface MetaOptions {
  readonly type: MetaScalarType;
  readonly default?: unknown;
  readonly postTypes: readonly string[];
  readonly sanitize?: (value: unknown) => unknown;
}

export interface MetaBoxFieldOption {
  readonly value: string;
  readonly label: string;
}

export interface MetaBoxField {
  readonly key: string;
  readonly label: string;
  /**
   * Drives the admin sidebar's input renderer. Built-in dispatcher
   * handles `text` / `textarea` / `number` / `email` / `url` /
   * `select` / `radio` / `checkbox`. Plugins may use custom values —
   * the renderer falls back to `<input type="text">` for unknown
   * types with a dev-mode console warning.
   */
  readonly inputType: string;
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

export interface MetaBoxOptions {
  readonly label: string;
  readonly context?: "side" | "normal" | "advanced";
  readonly priority?: "high" | "default" | "low";
  readonly postTypes: readonly string[];
  readonly capability?: string;
  readonly fields: readonly MetaBoxField[];
}

export interface RegisteredPostType extends PostTypeOptions {
  readonly name: string;
  readonly registeredBy: string | null;
}

export interface RegisteredTaxonomy extends TaxonomyOptions {
  readonly name: string;
  readonly registeredBy: string | null;
}

export interface RegisteredMeta extends MetaOptions {
  readonly key: string;
  readonly registeredBy: string | null;
}

export interface RegisteredMetaBox extends MetaBoxOptions {
  readonly id: string;
  readonly registeredBy: string | null;
}

export interface RegisteredCapability {
  readonly name: string;
  readonly minRole: UserRole;
  readonly registeredBy: string | null;
}

export interface PluginRegistry {
  readonly postTypes: ReadonlyMap<string, RegisteredPostType>;
  readonly taxonomies: ReadonlyMap<string, RegisteredTaxonomy>;
  readonly metaKeys: ReadonlyMap<string, RegisteredMeta>;
  readonly metaBoxes: ReadonlyMap<string, RegisteredMetaBox>;
  readonly capabilities: ReadonlyMap<string, RegisteredCapability>;
}

export interface MutablePluginRegistry extends PluginRegistry {
  readonly postTypes: Map<string, RegisteredPostType>;
  readonly taxonomies: Map<string, RegisteredTaxonomy>;
  readonly metaKeys: Map<string, RegisteredMeta>;
  readonly metaBoxes: Map<string, RegisteredMetaBox>;
  readonly capabilities: Map<string, RegisteredCapability>;
}

export function createPluginRegistry(): MutablePluginRegistry {
  return {
    postTypes: new Map(),
    taxonomies: new Map(),
    metaKeys: new Map(),
    metaBoxes: new Map(),
    capabilities: new Map(),
  };
}

export class DuplicateRegistrationError extends Error {
  constructor(kind: string, name: string) {
    super(`${kind} "${name}" is already registered`);
    this.name = "DuplicateRegistrationError";
  }
}

/**
 * Shape serialised into the admin's `<script id="plumix-manifest">` payload.
 * Intentionally a strict subset of `RegisteredPostType`: drops
 * `registeredBy` (plugin attribution is server-only debug metadata) and
 * `rewrite` (URL mapping is evaluated server-side). Add fields only when the
 * admin UI needs them.
 *
 * `adminSlug` is derived at build time (see `buildManifest`) and is what the
 * admin router uses for `/content/$slug`. Keeping it in the manifest rather
 * than re-deriving client-side lets the collision check run once on the
 * server and ships the final routing key as authoritative.
 */
export interface PostTypeManifestEntry {
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
 * today — kept as a separate type so the manifest boundary can diverge
 * (e.g., omit server-only `sanitize` callbacks) when needed.
 */
export interface MetaBoxFieldManifestEntry {
  readonly key: string;
  readonly label: string;
  readonly inputType: string;
  readonly description?: string;
  readonly required?: boolean;
  readonly placeholder?: string;
  readonly maxLength?: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly options?: readonly MetaBoxFieldOption[];
}

/**
 * Shape serialised for meta boxes in the manifest. Strict allowlist
 * projection of `RegisteredMetaBox`; drops `registeredBy` (server-only
 * debug metadata). `fields` is projected via
 * `MetaBoxFieldManifestEntry` so the field-level contract is independent
 * of the registration type.
 */
export interface MetaBoxManifestEntry {
  readonly id: string;
  readonly label: string;
  readonly context?: "side" | "normal" | "advanced";
  readonly priority?: "high" | "default" | "low";
  readonly postTypes: readonly string[];
  readonly capability?: string;
  readonly fields: readonly MetaBoxFieldManifestEntry[];
}

/**
 * Shape serialised for taxonomies in the manifest. Strict allowlist
 * projection of `RegisteredTaxonomy` — drops `registeredBy` (server-only
 * debug metadata) and server-only operational flags (`isInQuickEdit`,
 * `hasAdminColumn`, `rewrite`) that don't affect the admin UI today.
 * `postTypes` is kept so future admin surfaces (term-picker on post
 * editor) can filter by post type without a second round-trip.
 */
export interface TaxonomyManifestEntry {
  readonly name: string;
  readonly label: string;
  readonly labels?: { readonly singular?: string };
  readonly description?: string;
  readonly isHierarchical?: boolean;
  readonly postTypes?: readonly string[];
}

export interface PlumixManifest {
  readonly postTypes: readonly PostTypeManifestEntry[];
  readonly taxonomies: readonly TaxonomyManifestEntry[];
  readonly metaBoxes: readonly MetaBoxManifestEntry[];
}

/** Script tag id that carries the JSON-encoded manifest in the admin HTML. */
export const MANIFEST_SCRIPT_ID = "plumix-manifest";

export function emptyManifest(): PlumixManifest {
  return { postTypes: [], taxonomies: [], metaBoxes: [] };
}

/**
 * Project a registry snapshot into its manifest form — the subset that ships
 * to the admin bundle. Post types are ordered by `menuPosition` ascending,
 * with unspecified positions last. Among entries with the same (or no)
 * `menuPosition` the registration order wins — `Array.prototype.sort` is
 * stable per ES2019, and the registry's `Map` preserves insertion order.
 *
 * Throws `DuplicateAdminSlugError` if two post types resolve to the same
 * admin slug — the admin router can't disambiguate `/content/$slug` in that
 * case, and catching it at build time is cheaper than a 404 at runtime.
 */
export function buildManifest(registry: PluginRegistry): PlumixManifest {
  const entries = Array.from(registry.postTypes.values()).map(toPostTypeEntry);
  entries.sort((a, b) => {
    const ap = a.menuPosition ?? Number.POSITIVE_INFINITY;
    const bp = b.menuPosition ?? Number.POSITIVE_INFINITY;
    return ap - bp;
  });
  assertUniqueAdminSlugs(entries);
  const taxonomies = Array.from(registry.taxonomies.values()).map(
    toTaxonomyEntry,
  );
  const metaBoxes = Array.from(registry.metaBoxes.values()).map(toMetaBoxEntry);
  return { postTypes: entries, taxonomies, metaBoxes };
}

function assertUniqueAdminSlugs(
  entries: readonly PostTypeManifestEntry[],
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
      `Post types "${firstPostType}" and "${secondPostType}" both resolve ` +
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
// Adding a field to `PostTypeOptions` / `RegisteredPostType` does NOT
// automatically leak it; it must be added here AND to `PostTypeManifestEntry`
// to surface in the admin. `registeredBy` and `rewrite` are intentionally
// excluded: the first is debug metadata, the second is server-side URL
// mapping.
function toPostTypeEntry(pt: RegisteredPostType): PostTypeManifestEntry {
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

// Allowlist for taxonomy entries — same rationale as `toPostTypeEntry`.
// `registeredBy` excluded; `isPublic` / `isInQuickEdit` / `hasAdminColumn`
// / `rewrite` are server-/public-site-only and don't affect the admin
// surface, so they're intentionally dropped from the wire contract until
// a concrete admin need arises.
function toTaxonomyEntry(tax: RegisteredTaxonomy): TaxonomyManifestEntry {
  const { name, label, labels, description, isHierarchical, postTypes } = tax;
  return {
    name,
    label,
    labels,
    description,
    isHierarchical,
    postTypes,
  };
}

// Allowlist for meta box entries — same rationale as `toPostTypeEntry`.
// `registeredBy` is intentionally excluded (server-only debug metadata).
// `fields` is projected per entry so field-level internals could diverge
// from the registration type without altering the wire contract.
function toMetaBoxEntry(box: RegisteredMetaBox): MetaBoxManifestEntry {
  const { id, label, context, priority, postTypes, capability, fields } = box;
  return {
    id,
    label,
    context,
    priority,
    postTypes,
    capability,
    fields: fields.map(toMetaBoxFieldEntry),
  };
}

function toMetaBoxFieldEntry(field: MetaBoxField): MetaBoxFieldManifestEntry {
  const {
    key,
    label,
    inputType,
    description,
    required,
    placeholder,
    maxLength,
    min,
    max,
    step,
    options,
  } = field;
  return {
    key,
    label,
    inputType,
    description,
    required,
    placeholder,
    maxLength,
    min,
    max,
    step,
    options,
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

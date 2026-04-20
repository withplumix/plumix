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

export interface MetaBoxField {
  readonly key: string;
  readonly label: string;
  readonly inputType: string;
  readonly maxLength?: number;
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

export interface PlumixManifest {
  readonly postTypes: readonly PostTypeManifestEntry[];
}

/** Script tag id that carries the JSON-encoded manifest in the admin HTML. */
export const MANIFEST_SCRIPT_ID = "plumix-manifest";

export function emptyManifest(): PlumixManifest {
  return { postTypes: [] };
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
  return { postTypes: entries };
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
  // Two separate anchored replaces rather than `/^-+|-+$/g` — CodeQL flags
  // the alternation form as a polynomial-regex risk on dash-heavy inputs,
  // and splitting it is equally readable and provably linear.
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  if (slug.length === 0) {
    const from = plural === undefined ? "its name" : `plural="${plural}"`;
    throw new Error(
      `Cannot derive an admin slug for post type "${name}" from ${from} — result was empty.`,
    );
  }
  return slug;
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

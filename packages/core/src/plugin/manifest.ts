import type { UserRole } from "../db/schema/users.js";

export interface PostTypeOptions {
  readonly label: string;
  readonly labels?: { readonly singular?: string };
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
 */
export interface PostTypeManifestEntry {
  readonly name: string;
  readonly label: string;
  readonly labels?: { readonly singular?: string };
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
 * to the admin bundle. Post types are ordered by `menuPosition` (ascending;
 * unspecified → Infinity) with registration order as tiebreaker, matching
 * how the sidebar should render them.
 */
export function buildManifest(registry: PluginRegistry): PlumixManifest {
  const entries = Array.from(registry.postTypes.values()).map(
    toPostTypeEntry,
  );
  entries.sort((a, b) => {
    const ap = a.menuPosition ?? Number.POSITIVE_INFINITY;
    const bp = b.menuPosition ?? Number.POSITIVE_INFINITY;
    return ap - bp;
  });
  return { postTypes: entries };
}

function toPostTypeEntry(pt: RegisteredPostType): PostTypeManifestEntry {
  const entry: Mutable<PostTypeManifestEntry> = {
    name: pt.name,
    label: pt.label,
  };
  if (pt.labels !== undefined) entry.labels = pt.labels;
  if (pt.description !== undefined) entry.description = pt.description;
  if (pt.supports !== undefined) entry.supports = pt.supports;
  if (pt.taxonomies !== undefined) entry.taxonomies = pt.taxonomies;
  if (pt.isHierarchical !== undefined) entry.isHierarchical = pt.isHierarchical;
  if (pt.isPublic !== undefined) entry.isPublic = pt.isPublic;
  if (pt.hasArchive !== undefined) entry.hasArchive = pt.hasArchive;
  if (pt.capabilityType !== undefined) entry.capabilityType = pt.capabilityType;
  if (pt.menuPosition !== undefined) entry.menuPosition = pt.menuPosition;
  if (pt.menuIcon !== undefined) entry.menuIcon = pt.menuIcon;
  return entry;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

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

const MANIFEST_SCRIPT_RE = new RegExp(
  `<script id="${MANIFEST_SCRIPT_ID}"[^>]*>[\\s\\S]*?</script>`,
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

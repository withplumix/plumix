import type { MetaBoxField, PluginRegistry } from "../plugin/manifest.js";
import type { ResolvedMeta } from "../rpc/meta/core.js";
import type { TemplateData } from "../theme.js";
import { listEntryMetaFields } from "../plugin/manifest.js";
import { nonEmpty } from "./site-settings.js";

/**
 * A page's resolved social image. `width`/`height` are absent when the image's
 * size isn't known.
 */
export interface OgImage {
  readonly url: string;
  readonly width?: number;
  readonly height?: number;
}

// A hydrated media reference exposes a string `url` and the row's measured
// `width`/`height` (null until something measures them); an orphaned single
// reference hydrates to null. Read structurally — core can't import the media
// plugin's `MediaReference` type.
function mediaImage(value: unknown): OgImage | null {
  if (value === null || typeof value !== "object" || !("url" in value)) {
    return null;
  }
  const url = nonEmpty(value.url);
  if (!url) return null;
  const width = measured("width" in value ? value.width : null);
  const height = measured("height" in value ? value.height : null);
  // The size travels as a pair or not at all: one axis alone tells a scraper
  // nothing it can lay out with.
  return width !== null && height !== null ? { url, width, height } : { url };
}

// A media row carries null on both axes until something measures it.
function measured(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

/** The semantic role a media field plays for its entry. */
type MediaFieldRole = NonNullable<MetaBoxField["role"]>;

/**
 * Resolve one role's image from an entry's role-tagged media fields. Reads the
 * hydrated `entry.meta` value structurally, so an orphaned reference (null) or
 * a value with no usable url falls through to the next field of the same role.
 * Returns null when nothing resolves, handing the rest of the chain to the
 * plugin that owns it.
 */
function resolveEntryRoleImage(
  fields: readonly MetaBoxField[],
  meta: ResolvedMeta,
  role: MediaFieldRole,
): OgImage | null {
  for (const field of fields) {
    if (field.role !== role) continue;
    const image = mediaImage(meta[field.key]);
    if (image) return image;
  }
  return null;
}

/**
 * One role's image for a page — null for anything that is not a single entry.
 * Scopes {@link resolveEntryRoleImage} to the entry's own content-type fields.
 *
 * Core reads no role image itself. It stays here because the roles are
 * declared on core's own meta-box fields, and two plugins would otherwise each
 * ship a copy of this walk.
 */
export function entryRoleImage(
  plugins: PluginRegistry,
  data: TemplateData,
  role: MediaFieldRole,
): OgImage | null {
  if (data.kind !== "entry") return null;
  return resolveEntryRoleImage(
    listEntryMetaFields(plugins, data.entry.type),
    data.entry.meta,
    role,
  );
}
